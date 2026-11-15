// Injected into the proxied belli.ai homepage: the "Demo" links open a
// small form (work email + airline) that starts a per-airline demo.
(function () {
  var script = document.currentScript
  var ORIGIN = script ? new URL(script.src).origin : location.origin
  var ORANGE = "#ff5a1f"

  var css =
    "#bd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:2147483000;font-family:Inter,system-ui,sans-serif}" +
    "#bd-card{background:#fff;color:#111;width:min(440px,calc(100vw - 32px));border-radius:10px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.35);position:relative}" +
    "#bd-card h2{margin:0 0 6px;font-size:22px}#bd-card p{margin:0 0 18px;color:#555;font-size:14px;line-height:1.45}" +
    "#bd-card label{display:block;font-size:13px;font-weight:600;margin:12px 0 6px}" +
    "#bd-card input{width:100%;box-sizing:border-box;height:44px;border:1px solid #d4d4d4;border-radius:6px;padding:0 12px;font-size:15px}" +
    "#bd-card button[type=submit]{margin-top:18px;width:100%;height:44px;border:0;border-radius:6px;background:" + ORANGE + ";color:#fff;font-size:15px;font-weight:600;cursor:pointer}" +
    "#bd-card button[disabled]{opacity:.6;cursor:wait}#bd-close{position:absolute;top:10px;right:14px;border:0;background:none;font-size:22px;cursor:pointer;color:#888}" +
    "#bd-list{border:1px solid #e5e5e5;border-radius:6px;margin-top:4px;max-height:220px;overflow:auto;display:none}" +
    "#bd-list div{padding:9px 12px;cursor:pointer;font-size:14px}#bd-list div:hover,#bd-list div.on{background:#fff3ee}" +
    "#bd-list small{color:#888;margin-left:6px}#bd-err{color:#c62828;font-size:13px;margin-top:10px;min-height:1em}"
  var style = document.createElement("style")
  style.textContent = css
  document.head.appendChild(style)

  function open() {
    if (document.getElementById("bd-overlay")) return
    var o = document.createElement("div")
    o.id = "bd-overlay"
    o.innerHTML =
      '<form id="bd-card" autocomplete="off">' +
      '<button type="button" id="bd-close" aria-label="Close">×</button>' +
      "<h2>Your own Belli demo</h2>" +
      "<p>Pick your airline. In about two minutes you get Belli with your network, fleet and sample shipments: airline dashboard and booking portal.</p>" +
      '<label for="bd-email">Work email</label><input id="bd-email" type="email" required placeholder="you@airline.com">' +
      '<label for="bd-airline">Airline</label><input id="bd-airline" required placeholder="Start typing, e.g. Etihad">' +
      '<div id="bd-list" role="listbox"></div>' +
      '<div id="bd-err"></div><button type="submit">Create my demo</button></form>'
    document.body.appendChild(o)
    var form = o.querySelector("form"), list = o.querySelector("#bd-list"), input = o.querySelector("#bd-airline"), err = o.querySelector("#bd-err")
    var picked = null, timer = null
    o.addEventListener("click", function (e) { if (e.target === o) o.remove() })
    o.querySelector("#bd-close").onclick = function () { o.remove() }
    input.addEventListener("input", function () {
      picked = null
      clearTimeout(timer)
      var q = input.value.trim()
      if (q.length < 2) { list.style.display = "none"; return }
      timer = setTimeout(function () {
        fetch(ORIGIN + "/api/airlines?q=" + encodeURIComponent(q)).then(function (r) { return r.json() }).then(function (rows) {
          list.innerHTML = ""
          rows.forEach(function (a) {
            var d = document.createElement("div")
            d.innerHTML = a.name.replace(/</g, "&lt;") + "<small>" + a.iata + "</small>"
            d.onclick = function () { picked = a; input.value = a.name; list.style.display = "none" }
            list.appendChild(d)
          })
          list.style.display = rows.length ? "block" : "none"
        })
      }, 150)
    })
    form.addEventListener("submit", function (e) {
      e.preventDefault()
      err.textContent = ""
      var btn = form.querySelector("button[type=submit]")
      btn.disabled = true
      btn.textContent = "Creating your demo…"
      fetch(ORIGIN + "/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.querySelector("#bd-email").value, airline: picked ? picked.iata : input.value }),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j } }) })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || "Something went wrong")
          location.href = res.j.statusUrl
        })
        .catch(function (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Create my demo" })
    })
    form.querySelector("#bd-email").focus()
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-belli-demo]")
    if (!a) return
    e.preventDefault()
    open()
  }, true)
  if (location.hash === "#belli-demo") open()
})()
