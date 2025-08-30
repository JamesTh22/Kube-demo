async function json(url) {
    // reset options except "all"
    [...nsSelect.options].forEach((o, i) => i > 0 && nsSelect.remove(i));
    items.forEach(n => {
        const opt = document.createElement("option");
        opt.value = n.name;
        opt.textContent = `${n.name} (${n.status || ""})`;
        nsSelect.appendChild(opt);
    });
}


function table(headers, rows) {
    const t = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    headers.forEach(h => {
        const th = document.createElement("th");
        th.textContent = h;
        trh.appendChild(th);
    });
    thead.appendChild(trh);
    t.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach(r => {
        const tr = document.createElement("tr");
        r.forEach(cell => {
            const td = document.createElement("td");
            td.textContent = cell;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    return t;
}


async function loadPods() {
    const ns = nsSelect.value;
    const pods = await json(`/api/pods?ns=${encodeURIComponent(ns)}`);
    const rows = pods.map(p => [p.name, p.namespace, p.phase, p.ready, String(p.restarts), p.nodeName || "", p.age]);
    const headers = ["Name", "Namespace", "Phase", "Ready?", "Restarts", "Node", "Age"];
    const wrap = document.getElementById("pods");
    wrap.innerHTML = "";
    wrap.appendChild(table(headers, rows));
}


async function loadDeployments() {
    const ns = nsSelect.value;
    const items = await json(`/api/deployments?ns=${encodeURIComponent(ns)}`);
    const rows = items.map(d => [d.name, d.namespace, `${d.readyReplicas}/${d.replicas}`, `${d.availableReplicas}`, `${d.updatedReplicas}`]);
    const headers = ["Name", "Namespace", "Ready/Desired", "Available", "Updated"];
    const wrap = document.getElementById("deployments");
    wrap.innerHTML = "";
    wrap.appendChild(table(headers, rows));
}


async function loadServices() {
    const ns = nsSelect.value;
    const items = await json(`/api/services?ns=${encodeURIComponent(ns)}`);
    const rows = items.map(s => [s.name, s.namespace, s.type, s.clusterIP || "", s.ports.join(", ")]);
    const headers = ["Name", "Namespace", "Type", "ClusterIP", "Ports"];
    const wrap = document.getElementById("services");
    wrap.innerHTML = "";
    wrap.appendChild(table(headers, rows));
}


async function refreshAll() {
    await Promise.all([loadPods(), loadDeployments(), loadServices()]);
}


refreshBtn.addEventListener("click", refreshAll);
nsSelect.addEventListener("change", refreshAll);


(async function init() {
    await loadVersion();
    await loadNamespaces();
    await refreshAll();
    // Auto-refresh every 10s
    setInterval(refreshAll, 10000);
})();