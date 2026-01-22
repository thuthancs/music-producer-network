// script.js (full)
// - Node size = number of edges (songs)
// - Link exists if a producer appears in any collaborators list (and that collaborator exists as a node)
// - No labels by default; tooltip on hover
// - Hover highlights the node + its 1-hop neighborhood; everything else fades
// - Colored nodes/links (not black & white)
// - Click a node to "pin" a detail panel showing that producer's songs

const svg = d3.select("#chart");
const tooltip = d3.select("#tooltip");

// Create (or reuse) a right-side details panel
let details = document.getElementById("details");
if (!details) {
    details = document.createElement("div");
    details.id = "details";
    details.style.position = "absolute";
    details.style.top = "80px";
    details.style.right = "18px";
    details.style.width = "320px";
    details.style.maxHeight = "70vh";
    details.style.overflow = "auto";
    details.style.padding = "12px 12px";
    details.style.borderRadius = "12px";
    details.style.background = "rgba(15, 20, 35, 0.92)";
    details.style.border = "1px solid rgba(255,255,255,0.12)";
    details.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    details.style.backdropFilter = "blur(6px)";
    details.style.fontSize = "12px";
    details.style.lineHeight = "1.35";
    details.style.display = "none";
    details.style.color = "#ffff"
    document.body.appendChild(details);
}

function w() {
    return svg.node().clientWidth;
}
function h() {
    return svg.node().clientHeight;
}

fetch("./kpop_producers.json")
    .then((r) => {
        if (!r.ok) throw new Error(`Failed to load JSON: ${r.status}`);
        return r.json();
    })
    .then((data) => {
        // -----------------------------
        // Build nodes from JSON values
        // -----------------------------
        const nodes = Object.values(data).map((p) => ({
            id: String(p.id),
            name: p.name ?? `Producer ${p.id}`,
            edgeCount: Array.isArray(p.edges) ? p.edges.length : 0,
        }));

        const nodeById = new Map(nodes.map((n) => [n.id, n]));

        // -----------------------------
        // Build deduped undirected links
        // A-B if A mentions B as collaborator (and B exists)
        // -----------------------------
        const linksMap = new Map();
        const linkKey = (a, b) => {
            const [x, y] = a < b ? [a, b] : [b, a];
            return `${x}--${y}`;
        };

        for (const producerKey of Object.keys(data)) {
            const producer = data[producerKey];
            if (!producer) continue;

            const fromId = String(producer.id);
            const edges = Array.isArray(producer.edges) ? producer.edges : [];

            for (const edge of edges) {
                const song = edge?.song_name ?? "Unknown song";
                const collaborators = Array.isArray(edge?.collaborators) ? edge.collaborators : [];

                for (const rawCollabId of collaborators) {
                    const toId = String(rawCollabId);

                    if (toId === fromId) continue;
                    if (!nodeById.has(toId)) continue; // only connect to producers that exist in the JSON

                    const key = linkKey(fromId, toId);
                    if (!linksMap.has(key)) {
                        linksMap.set(key, { source: fromId, target: toId, songs: new Set([song]) });
                    } else {
                        linksMap.get(key).songs.add(song);
                    }
                }
            }
        }

        const links = Array.from(linksMap.values()).map((l) => ({
            source: l.source,
            target: l.target,
            songs: Array.from(l.songs),
        }));

        // -----------------------------
        // Node sizing
        // -----------------------------
        const maxEdges = d3.max(nodes, (d) => d.edgeCount) ?? 0;
        const radius = d3
            .scaleSqrt()
            .domain([0, Math.max(1, maxEdges)])
            .range([7, 28]);

        // -----------------------------
        // Color scale (not B/W)
        // -----------------------------
        const color = d3
            .scaleOrdinal()
            .domain(d3.range(1, 11)) // edge counts 1–10
            .range(d3.schemeSet2);

        // -----------------------------
        // SVG root group + zoom
        // -----------------------------
        svg.attr("viewBox", [0, 0, w(), h()]);
        const g = svg.append("g");

        svg.call(
            d3
                .zoom()
                .scaleExtent([0.3, 4])
                .on("zoom", (event) => g.attr("transform", event.transform))
        );

        // -----------------------------
        // Adjacency map for hover highlighting
        // -----------------------------
        const neighbors = new Map(); // id -> Set(ids)
        for (const n of nodes) neighbors.set(n.id, new Set([n.id]));

        for (const l of links) {
            const a = typeof l.source === "object" ? l.source.id : l.source;
            const b = typeof l.target === "object" ? l.target.id : l.target;
            neighbors.get(a)?.add(b);
            neighbors.get(b)?.add(a);
        }

        // -----------------------------
        // Draw links
        // -----------------------------
        const link = g
            .append("g")
            .selectAll("line")
            .data(links)
            .join("line")
            .attr("class", "link")
            .attr("stroke", (d) => {
                const sid = typeof d.source === "object" ? d.source.id : d.source;
                return color(sid);
            });

        // -----------------------------
        // Selection state (for click)
        // -----------------------------
        let selectedId = null;

        function showDetailsFor(producerId) {
            const p = data[String(producerId)];
            if (!p) return;

            const songs = (Array.isArray(p.edges) ? p.edges : [])
                .map((e) => e?.song_name)
                .filter(Boolean);

            // de-dup + sort for nicer display
            const uniqueSongs = Array.from(new Set(songs)).sort((a, b) => a.localeCompare(b));

            details.style.display = "block";
            details.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-weight:800;font-size:14px;margin-bottom:2px;">
              ${escapeHtml(p.name ?? `Producer ${p.id}`)}
            </div>
            <div style="opacity:.8;">ID: <strong>${escapeHtml(String(p.id))}</strong></div>
            <div style="opacity:.8;">Songs (edges): <strong>${uniqueSongs.length}</strong></div>
          </div>
          <button id="detailsClose" style="
            all: unset;
            cursor: pointer;
            padding: 6px 10px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.16);
            background: rgba(255,255,255,0.06);
            font-weight: 700;
            line-height: 1;
          ">×</button>
        </div>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.10);margin:10px 0;">
        ${uniqueSongs.length
                    ? `<ol style="margin:0;padding-left:18px;">
                 ${uniqueSongs.map((s) => `<li style="margin:6px 0;">${escapeHtml(s)}</li>`).join("")}
               </ol>`
                    : `<div style="opacity:.8;">No songs listed for this producer.</div>`
                }
      `;

            const btn = document.getElementById("detailsClose");
            if (btn) {
                btn.addEventListener("click", () => {
                    selectedId = null;
                    details.style.display = "none";
                    // reset selection visuals
                    node.classed("node-selected", false);
                });
            }
        }

        // -----------------------------
        // Draw nodes
        // -----------------------------
        const node = g
            .append("g")
            .selectAll("circle")
            .data(nodes)
            .join("circle")
            .attr("class", "node")
            .attr("r", (d) => radius(d.edgeCount))
            .attr("fill", "#6BAED6")
            .on("mouseenter", (event, d) => {
                // Tooltip (show name only on hover)
                tooltip
                    .style("opacity", 1)
                    .attr("aria-hidden", "false")
                    .html(
                        `<div style="font-weight:700;font-size:13px;margin-bottom:4px;">
              ${escapeHtml(d.name)}
            </div>
            <div>ID: <strong>${escapeHtml(d.id)}</strong></div>
            <div>Songs (edges): <strong>${d.edgeCount}</strong></div>
            <div style="opacity:.75;margin-top:6px;">Click to view songs</div>`
                    );

                moveTooltip(event);

                // Highlight 1-hop neighborhood
                const neigh = neighbors.get(d.id) ?? new Set([d.id]);

                node.classed("faded", (n) => !neigh.has(n.id));
                link.classed("faded", (l) => {
                    const a = typeof l.source === "object" ? l.source.id : l.source;
                    const b = typeof l.target === "object" ? l.target.id : l.target;
                    return !(neigh.has(a) && neigh.has(b));
                });

                // Glow hovered node
                node.classed("node-glow", (n) => n.id === d.id);
            })
            .on("mousemove", (event) => moveTooltip(event))
            .on("mouseleave", () => {
                tooltip.style("opacity", 0).attr("aria-hidden", "true");

                // Reset fade + glow (but keep selection styling if any)
                node.classed("faded", false).classed("node-glow", false);
                link.classed("faded", false);
            })
            .on("click", (event, d) => {
                // prevent zoom drag from also triggering click weirdness
                event.stopPropagation();

                selectedId = d.id;
                showDetailsFor(d.id);

                // Optional: visually indicate selected node
                node.classed("node-selected", (n) => n.id === selectedId);
            });

        // Clicking the empty canvas hides the panel
        svg.on("click", () => {
            selectedId = null;
            details.style.display = "none";
            node.classed("node-selected", false);
        });

        // -----------------------------
        // Force simulation
        // -----------------------------
        const sim = d3
            .forceSimulation(nodes)
            .force(
                "link",
                d3.forceLink(links).id((d) => d.id).distance(120).strength(0.7)
            )
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(w() / 2, h() / 2))
            .force("collide", d3.forceCollide().radius((d) => radius(d.edgeCount) + 4));

        // Drag behavior
        node.call(
            d3
                .drag()
                .on("start", (event, d) => {
                    if (!event.active) sim.alphaTarget(0.25).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on("drag", (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on("end", (event, d) => {
                    if (!event.active) sim.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                })
        );

        sim.on("tick", () => {
            link
                .attr("x1", (d) => d.source.x)
                .attr("y1", (d) => d.source.y)
                .attr("x2", (d) => d.target.x)
                .attr("y2", (d) => d.target.y);

            node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
        });

        // Resize handling
        window.addEventListener("resize", () => {
            svg.attr("viewBox", [0, 0, w(), h()]);
            sim.force("center", d3.forceCenter(w() / 2, h() / 2));
            sim.alpha(0.3).restart();
        });
    })
    .catch((err) => {
        console.error(err);
        alert(err.message);
    });

// -----------------------------
// Helpers
// -----------------------------
function moveTooltip(event) {
    tooltip.style("left", `${event.pageX}px`).style("top", `${event.pageY}px`);
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}
