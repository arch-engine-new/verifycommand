(function () {
  const PAGES = [
    { id: "index", href: "../index.html", label: "总览" },
    { id: "fixture-list", href: "../fixture-list/index.html", label: "夹具台账" },
    { id: "checkout-form", href: "../checkout-form/index.html", label: "借出申请" },
    { id: "checkout-list", href: "../checkout-list/index.html", label: "在借 / 超期" },
    { id: "return-form", href: "../return-form/index.html", label: "归还核验" },
    { id: "calibration-board", href: "../calibration-board/index.html", label: "校准看板" },
  ];

  function currentId() {
    const path = location.pathname.replace(/\\/g, "/");
    const hit = PAGES.find((p) => path.includes("/" + p.id + "/"));
    return hit ? hit.id : "index";
  }

  function mount(activeId) {
    const id = activeId || currentId();
    const prefix = id === "index" ? "./" : "../";
    const nav = PAGES.map((p) => {
      const href = id === "index"
        ? (p.id === "index" ? "./index.html" : "./" + p.id + "/index.html")
        : (p.id === "index" ? "../index.html" : "../" + p.id + "/index.html");
      return '<a href="' + href + '" class="' + (p.id === id ? "is-active" : "") + '">' + p.label + "</a>";
    }).join("");

    const role = window.FixtureAPI ? FixtureAPI.getRole() : "班组长";
    const bar = document.createElement("header");
    bar.className = "topbar";
    bar.innerHTML =
      '<div class="brand"><span class="brand-mark"></span><div><h1>工具室夹具工作台</h1><small>Shift Console · ' +
      (window.FixtureAPI ? FixtureAPI.TODAY : "") +
      '</small></div></div><nav class="nav">' +
      nav +
      '</nav><label class="role-switch">角色 <select id="roleSelect">' +
      ["班组长", "仓管", "工艺员"]
        .map((r) => '<option value="' + r + '"' + (r === role ? " selected" : "") + ">" + r + "</option>")
        .join("") +
      "</select></label>";
    document.body.prepend(bar);
    const select = bar.querySelector("#roleSelect");
    select.addEventListener("change", function () {
      FixtureAPI.setRole(select.value);
      location.reload();
    });
  }

  function statusClass(status) {
    if (status === "在库") return "badge-in";
    if (status === "在借") return "badge-out";
    if (status === "超期" || status === "预警") return "badge-overdue";
    if (status === "校准锁定" || status === "锁定") return "badge-lock";
    if (status === "维修" || status === "损坏") return "badge-repair";
    return "";
  }

  function badge(status) {
    return '<span class="badge ' + statusClass(status) + '">' + status + "</span>";
  }

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  window.AptShell = { mount, currentId, badge, qs };
})();
