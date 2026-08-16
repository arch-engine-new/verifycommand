(function (global) {
  const STORAGE_KEY = "fixture-ledger-v1";
  const ROLE_KEY = "fixture-ledger-role";
  const TODAY = "2026-08-16";

  const TYPES = [
    { value: "hydraulic", label: "液压夹具" },
    { value: "pneumatic", label: "气动夹具" },
    { value: "pin", label: "定位销" },
    { value: "drill", label: "钻模" },
    { value: "mill", label: "铣夹" },
    { value: "gauge", label: "检具" },
    { value: "weld", label: "焊接夹具" },
  ];

  function seed() {
    return {
      fixtures: [
        { id: "fx-1001", code: "FX-1001", type: "hydraulic", status: "在库", calibrationDueDate: "2026-12-01", currentCheckoutId: null, updatedAt: "2026-08-10T08:00:00Z" },
        { id: "fx-1002", code: "FX-1002", type: "pneumatic", status: "超期", calibrationDueDate: "2026-11-01", currentCheckoutId: "co-01", updatedAt: "2026-08-01T08:00:00Z" },
        { id: "fx-1003", code: "FX-1003", type: "pin", status: "校准锁定", calibrationDueDate: "2026-08-16", currentCheckoutId: null, updatedAt: "2026-08-16T00:00:00Z" },
        { id: "fx-1004", code: "FX-1004", type: "drill", status: "维修", calibrationDueDate: "2026-10-01", currentCheckoutId: null, updatedAt: "2026-08-12T08:00:00Z" },
        { id: "fx-1005", code: "FX-1005", type: "mill", status: "在库", calibrationDueDate: "2026-08-20", currentCheckoutId: null, updatedAt: "2026-08-14T08:00:00Z" },
        { id: "fx-1006", code: "FX-1006", type: "gauge", status: "校准锁定", calibrationDueDate: "2026-08-01", currentCheckoutId: null, updatedAt: "2026-08-01T08:00:00Z" },
        { id: "fx-1007", code: "FX-1007", type: "weld", status: "在库", calibrationDueDate: "2026-09-01", currentCheckoutId: null, updatedAt: "2026-08-11T08:00:00Z" },
      ],
      checkouts: [
        {
          id: "co-01",
          fixtureId: "fx-1002",
          borrowerName: "张班长",
          purpose: "二班壳体加工",
          expectedReturnDate: "2026-08-10",
          status: "超期",
          createdAt: "2026-08-01T08:12:00Z",
          returnedAt: null,
          returnCondition: null,
        },
        {
          id: "co-02",
          fixtureId: "fx-1001",
          borrowerName: "李班长",
          purpose: "试切",
          expectedReturnDate: "2026-07-20",
          status: "已归还",
          createdAt: "2026-07-12T09:00:00Z",
          returnedAt: "2026-07-18T16:00:00Z",
          returnCondition: "完好",
        },
      ],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    const data = seed();
    save(data);
    return data;
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function daysBetween(a, b) {
    const ms = Date.parse(b + "T00:00:00") - Date.parse(a + "T00:00:00");
    return Math.round(ms / 86400000);
  }

  function typeLabel(value) {
    const hit = TYPES.find((t) => t.value === value);
    return hit ? hit.label : value;
  }

  function deriveFixtureStatus(fx, openCheckout) {
    const dueDays = daysBetween(TODAY, fx.calibrationDueDate);
    if (dueDays <= 0) return "校准锁定";
    if (openCheckout) {
      return daysBetween(TODAY, openCheckout.expectedReturnDate) < 0 ? "超期" : "在借";
    }
    if (fx.status === "维修") return "维修";
    return "在库";
  }

  function refreshDerived(data) {
    data.checkouts.forEach((co) => {
      if (co.status === "已归还") return;
      co.status = daysBetween(TODAY, co.expectedReturnDate) < 0 ? "超期" : "在借";
    });
    data.fixtures.forEach((fx) => {
      const open = data.checkouts.find((c) => c.id === fx.currentCheckoutId && c.status !== "已归还");
      fx.status = deriveFixtureStatus(fx, open || null);
    });
  }

  function getRole() {
    return sessionStorage.getItem(ROLE_KEY) || "班组长";
  }

  function setRole(role) {
    sessionStorage.setItem(ROLE_KEY, role);
  }

  function listFixtures(query) {
    const data = load();
    refreshDerived(data);
    save(data);
    const q = (query && query.q ? query.q : "").trim().toLowerCase();
    const status = query && query.status ? query.status : "";
    const type = query && query.type ? query.type : "";
    return data.fixtures
      .filter((fx) => (!q || fx.code.toLowerCase().includes(q) || typeLabel(fx.type).includes(q)))
      .filter((fx) => !status || fx.status === status)
      .filter((fx) => !type || fx.type === type)
      .map((fx) => ({ ...fx, typeLabel: typeLabel(fx.type) }));
  }

  function getFixture(id) {
    const data = load();
    refreshDerived(data);
    const fx = data.fixtures.find((f) => f.id === id);
    if (!fx) return null;
    const history = data.checkouts
      .filter((c) => c.fixtureId === id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { ...fx, typeLabel: typeLabel(fx.type), history };
  }

  function upsertFixture(input) {
    const role = getRole();
    if (role === "班组长") {
      return { ok: false, error: "班组长不能维护夹具主数据或校准到期日。" };
    }
    const data = load();
    const code = String(input.code || "").trim().toUpperCase();
    if (!code) return { ok: false, error: "夹具编码必填。" };
    let fx = data.fixtures.find((f) => f.id === input.id || f.code === code);
    if (!fx) {
      fx = {
        id: "fx-" + Date.now(),
        code,
        type: input.type || "hydraulic",
        status: "在库",
        calibrationDueDate: input.calibrationDueDate,
        currentCheckoutId: null,
        updatedAt: new Date().toISOString(),
      };
      data.fixtures.push(fx);
    } else {
      if (role === "工艺员") {
        fx.calibrationDueDate = input.calibrationDueDate || fx.calibrationDueDate;
      } else {
        fx.type = input.type || fx.type;
        fx.calibrationDueDate = input.calibrationDueDate || fx.calibrationDueDate;
        if (input.status === "在库" && fx.status === "维修") fx.status = "在库";
      }
      fx.updatedAt = new Date().toISOString();
    }
    refreshDerived(data);
    save(data);
    return { ok: true, fixture: fx };
  }

  function restoreFromRepair(id) {
    if (getRole() !== "仓管") {
      return { ok: false, error: "仅仓管可将维修态改回在库。" };
    }
    const data = load();
    const fx = data.fixtures.find((f) => f.id === id);
    if (!fx) return { ok: false, error: "夹具不存在。" };
    if (fx.status !== "维修") return { ok: false, error: "仅维修态可改回在库。" };
    fx.status = "在库";
    fx.updatedAt = new Date().toISOString();
    refreshDerived(data);
    save(data);
    return { ok: true, fixture: fx };
  }

  function createCheckout(input) {
    if (getRole() !== "班组长") {
      return { ok: false, error: "仅班组长可提交借出申请。" };
    }
    const data = load();
    refreshDerived(data);
    const fx = data.fixtures.find((f) => f.id === input.fixtureId);
    if (!fx) return { ok: false, error: "夹具不存在。" };
    const dueDays = daysBetween(TODAY, fx.calibrationDueDate);
    if (dueDays <= 0) {
      return {
        ok: false,
        error: "校准锁定：夹具 " + fx.code + " 校准到期日为 " + fx.calibrationDueDate + "（含当日），不可借出。",
      };
    }
    const occupied = data.checkouts.find(
      (c) => c.fixtureId === fx.id && c.status !== "已归还"
    );
    if (occupied || fx.status === "在借" || fx.status === "超期") {
      return {
        ok: false,
        error: "占用冲突：夹具 " + fx.code + " 已被 " + (occupied ? occupied.borrowerName : "他人") + " 在借，不能重复借出。",
      };
    }
    if (fx.status === "维修") {
      return { ok: false, error: "夹具 " + fx.code + " 处于维修态，不可借出。" };
    }
    if (fx.status !== "在库") {
      return { ok: false, error: "夹具当前状态为「" + fx.status + "」，必须在库才可借出。" };
    }
    if (!input.borrowerName || !input.expectedReturnDate || !input.purpose) {
      return { ok: false, error: "借用人、预计归还日、用途均为必填。" };
    }
    const co = {
      id: "co-" + Date.now(),
      fixtureId: fx.id,
      borrowerName: input.borrowerName,
      purpose: input.purpose,
      expectedReturnDate: input.expectedReturnDate,
      status: "在借",
      createdAt: new Date().toISOString(),
      returnedAt: null,
      returnCondition: null,
    };
    data.checkouts.push(co);
    fx.currentCheckoutId = co.id;
    refreshDerived(data);
    save(data);
    return { ok: true, checkout: co };
  }

  function listCheckouts(query) {
    const data = load();
    refreshDerived(data);
    save(data);
    const status = query && query.status ? query.status : "";
    const mine = query && query.mine === "1";
    const role = getRole();
    return data.checkouts
      .filter((c) => c.status !== "已归还" || status === "已归还")
      .filter((c) => !status || c.status === status)
      .filter((c) => !mine || role !== "班组长" || c.borrowerName)
      .map((c) => {
        const fx = data.fixtures.find((f) => f.id === c.fixtureId);
        return {
          ...c,
          fixtureCode: fx ? fx.code : c.fixtureId,
          typeLabel: fx ? typeLabel(fx.type) : "",
        };
      })
      .sort((a, b) => (a.status === "超期" && b.status !== "超期" ? -1 : 0));
  }

  function returnCheckout(input) {
    if (getRole() !== "仓管") {
      return { ok: false, error: "仅仓管可做归还核验。" };
    }
    const data = load();
    const co = data.checkouts.find((c) => c.id === input.checkoutId);
    if (!co || co.status === "已归还") {
      return { ok: false, error: "在借单据不存在或已关闭。" };
    }
    if (input.condition !== "完好" && input.condition !== "损坏") {
      return { ok: false, error: "请选择完好或损坏。" };
    }
    const fx = data.fixtures.find((f) => f.id === co.fixtureId);
    co.status = "已归还";
    co.returnedAt = new Date().toISOString();
    co.returnCondition = input.condition;
    if (fx) {
      fx.currentCheckoutId = null;
      fx.status = input.condition === "损坏" ? "维修" : "在库";
      fx.updatedAt = new Date().toISOString();
    }
    refreshDerived(data);
    save(data);
    return { ok: true, checkout: co, fixture: fx };
  }

  function listCalibration() {
    const data = load();
    refreshDerived(data);
    save(data);
    return data.fixtures
      .map((fx) => {
        const daysRemaining = daysBetween(TODAY, fx.calibrationDueDate);
        let level = "正常";
        if (daysRemaining <= 0) level = "锁定";
        else if (daysRemaining <= 7) level = "预警";
        return {
          ...fx,
          typeLabel: typeLabel(fx.type),
          daysRemaining,
          level,
        };
      })
      .filter((row) => row.level !== "正常")
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  function stats() {
    const fixtures = listFixtures({});
    const open = listCheckouts({});
    const cal = listCalibration();
    return {
      inStock: fixtures.filter((f) => f.status === "在库").length,
      out: open.filter((c) => c.status === "在借").length,
      overdue: open.filter((c) => c.status === "超期").length,
      locked: cal.filter((c) => c.level === "锁定").length,
    };
  }

  global.FixtureAPI = {
    TODAY,
    TYPES,
    typeLabel,
    getRole,
    setRole,
    listFixtures,
    getFixture,
    upsertFixture,
    restoreFromRepair,
    createCheckout,
    listCheckouts,
    returnCheckout,
    listCalibration,
    stats,
    reset() {
      localStorage.removeItem(STORAGE_KEY);
      return load();
    },
  };
})(window);
