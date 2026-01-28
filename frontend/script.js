// script.js (full)
// - Node size = number of collaborations
// - Link exists if a producer appears in any collaborators list (and that collaborator exists as a node)
// - No labels by default; tooltip on hover
// - Hover highlights the node + its 1-hop neighborhood; edges appear on hover
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
    details.style.color = "#ffff";
    details.style.pointerEvents = "auto";
    details.style.zIndex = "1000";
    document.body.appendChild(details);
}

function w() {
    return svg.node().clientWidth;
}
function h() {
    return svg.node().clientHeight;
}

fetch("./output_50.json")
    .then((r) => {
        if (!r.ok) throw new Error(`Failed to load JSON: ${r.status}`);
        return r.json();
    })
    .then((data) => {
        // Access the network object from the JSON structure
        const networkData = data.network || data;

        // -----------------------------
        // Build nodes from JSON values
        // -----------------------------
        const nodes = Object.values(networkData).map((p) => ({
            id: String(p.id),
            name: p.name ?? `Producer ${p.id}`,
            edgeCount: p.total_songs ?? (Array.isArray(p.edges) ? p.edges.length : 0),
            totalCollaborations: p.total_collaborations ?? 0,
            uniqueCollaborators: p.unique_collaborators_count ?? 0,
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

        for (const producerKey of Object.keys(networkData)) {
            const producer = networkData[producerKey];
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

        // Map links to use node objects instead of IDs for easier position updates
        const links = Array.from(linksMap.values()).map((l) => {
            const sourceNode = nodeById.get(l.source);
            const targetNode = nodeById.get(l.target);
            return {
                source: sourceNode || l.source,
                target: targetNode || l.target,
                songs: Array.from(l.songs),
                sourceId: l.source,
                targetId: l.target,
            };
        });

        // -----------------------------
        // Node sizing (based on collaborations)
        // -----------------------------
        const maxCollaborations = d3.max(nodes, (d) => d.totalCollaborations) ?? 0;
        const minCollaborations = d3.min(nodes, (d) => d.totalCollaborations) ?? 0;
        // Use linear scale for more visible differences between collaboration counts
        const radius = d3
            .scaleLinear()
            .domain([minCollaborations, maxCollaborations])
            .range([8, 28]);

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
            const a = typeof l.source === "object" ? l.source.id : (l.sourceId || l.source);
            const b = typeof l.target === "object" ? l.target.id : (l.targetId || l.target);
            neighbors.get(a)?.add(b);
            neighbors.get(b)?.add(a);
        }

        // -----------------------------
        // Draw links (initially hidden)
        // -----------------------------
        const link = g
            .append("g")
            .selectAll("line")
            .data(links)
            .join("line")
            .attr("class", "link")
            .attr("stroke", (d) => {
                const sid = typeof d.source === "object" ? d.source.id : (d.sourceId || d.source);
                return color(sid);
            })
            .style("opacity", 0); // Initially hidden

        // -----------------------------
        // Selection state (for click)
        // -----------------------------
        let selectedId = null;
        let isSubNetworkMode = false;

        function showSubNetwork(producerId) {
            const neigh = neighbors.get(producerId) ?? new Set([producerId]);
            isSubNetworkMode = true;

            // Show edges only within the sub-network
            link
                .transition()
                .duration(300)
                .style("opacity", (l) => {
                    const a = typeof l.source === "object" ? l.source.id : (l.sourceId || l.source);
                    const b = typeof l.target === "object" ? l.target.id : (l.targetId || l.target);
                    return (neigh.has(a) && neigh.has(b)) ? 0.6 : 0;
                });

            // Hide/fade nodes not in the sub-network
            node
                .transition()
                .duration(300)
                .style("opacity", (n) => neigh.has(n.id) ? 1 : 0.1);

            // Set faded class separately (can't chain classed after transition)
            node.classed("faded", (n) => !neigh.has(n.id));

            // Show labels for nodes in the sub-network
            // Update ALL label positions from actual node positions first
            nodeLabels
                .each((d) => {
                    // Get the actual rendered position of the node for ALL labels
                    const nodeElement = node.filter((n) => n.id === d.id);
                    if (nodeElement.size() > 0) {
                        const cx = parseFloat(nodeElement.attr("cx"));
                        const cy = parseFloat(nodeElement.attr("cy"));
                        if (!isNaN(cx) && !isNaN(cy)) {
                            d.x = cx;
                            d.y = cy;
                        } else {
                            // Fallback to node data position
                            const nodeData = nodes.find(n => n.id === d.id);
                            if (nodeData) {
                                d.x = nodeData.baseX || nodeData.x || 0;
                                d.y = nodeData.baseY || nodeData.y || 0;
                            }
                        }
                    } else {
                        // Fallback to node data position
                        const nodeData = nodes.find(n => n.id === d.id);
                        if (nodeData) {
                            d.x = nodeData.baseX || nodeData.x || 0;
                            d.y = nodeData.baseY || nodeData.y || 0;
                        }
                    }
                })
                // Set positions and opacity immediately, then transition for smoothness
                .attr("x", (d) => {
                    const x = d.x || 0;
                    return isNaN(x) ? 0 : x;
                })
                .attr("y", (d) => {
                    const y = (d.y || 0) + radius(d.totalCollaborations) + 15;
                    return isNaN(y) ? 15 : y;
                })
                .style("opacity", (d) => {
                    const shouldShow = neigh.has(d.id);
                    return shouldShow ? 1 : 0;
                })
                .transition()
                .duration(300)
                .style("opacity", (d) => {
                    const shouldShow = neigh.has(d.id);
                    return shouldShow ? 1 : 0;
                });
        }

        function showFullNetwork() {
            isSubNetworkMode = false;
            selectedId = null;

            // Hide all edges
            link
                .transition()
                .duration(300)
                .style("opacity", 0);

            // Show all nodes at full opacity
            node
                .transition()
                .duration(300)
                .style("opacity", 1);

            // Set classes separately (can't chain classed after transition)
            node.classed("faded", false)
                .classed("node-selected", false);

            // Hide all labels
            nodeLabels
                .transition()
                .duration(300)
                .style("opacity", 0);
        }

        function showDetailsFor(producerId) {
            const p = networkData[String(producerId)];
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
            <div style="opacity:.8;">Total Songs: <strong>${p.total_songs ?? uniqueSongs.length}</strong></div>
            <div style="opacity:.8;">Total Collaborations: <strong>${p.total_collaborations ?? 0}</strong></div>
            <div style="opacity:.8;">Unique Collaborators: <strong>${p.unique_collaborators_count ?? 0}</strong></div>
            ${p.url ? `<div style="opacity:.8;margin-top:4px;"><a href="${escapeHtml(p.url)}" target="_blank" style="color:#6BAED6;text-decoration:none;">View on Genius →</a></div>` : ''}
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
            pointer-events: auto;
            z-index: 1001;
            position: relative;
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
                // Remove any existing listeners first
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);

                newBtn.addEventListener("click", (event) => {
                    event.stopPropagation(); // Prevent event from bubbling to SVG
                    event.preventDefault(); // Prevent any default behavior
                    console.log("Close button clicked"); // Debug

                    // Close the modal first
                    selectedId = null;
                    details.style.display = "none";
                    node.classed("node-selected", false);

                    // Then restore the network
                    showFullNetwork();
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
            .attr("r", (d) => radius(d.totalCollaborations))
            .attr("fill", "#6BAED6")
            .attr("cx", (d) => {
                // Ensure initial position is valid
                const x = d.x;
                return (x !== undefined && !isNaN(x) && isFinite(x)) ? x : w() / 2;
            })
            .attr("cy", (d) => {
                // Ensure initial position is valid
                const y = d.y;
                return (y !== undefined && !isNaN(y) && isFinite(y)) ? y : h() / 2;
            });

        // -----------------------------
        // Draw node labels (initially hidden)
        // -----------------------------
        const nodeLabels = g
            .append("g")
            .attr("class", "node-labels-group")
            .selectAll("text")
            .data(nodes)
            .join("text")
            .attr("class", "node-label")
            .text((d) => d.name || `Producer ${d.id}`)
            .attr("x", (d) => d.x || 0)
            .attr("y", (d) => (d.y || 0) + radius(d.totalCollaborations) + 15)
            .style("font-size", "12px")
            .style("fill", "#000000")
            .style("text-anchor", "middle")
            .style("pointer-events", "none")
            .style("opacity", 0)
            .style("font-weight", "500")
            .style("dominant-baseline", "hanging");

        // Initialize floating animation properties (positions will be set after layout)
        nodes.forEach((n, i) => {
            n.floatPhase = (i * 2 * Math.PI) / nodes.length; // Stagger phases for natural look
            n.floatAmplitude = 2 + Math.random() * 2; // Random amplitude between 2-4 pixels
            n.floatSpeed = 0.5 + Math.random() * 0.5; // Random speed between 0.5-1.0
            // baseX/baseY will be set after initial layout
        });

        let animationTime = 0;
        let isAnimating = true;
        let hoveredNodeId = null;

        function animateFloat() {
            if (!isAnimating) {
                requestAnimationFrame(animateFloat);
                return;
            }

            animationTime += 0.016; // ~60fps

            nodes.forEach((n) => {
                // Skip animation for hovered node or if in sub-network mode with faded nodes
                if (hoveredNodeId === n.id || (isSubNetworkMode && !neighbors.get(selectedId || '')?.has(n.id))) {
                    return;
                }

                // Skip if node doesn't have valid position
                if (!n.baseX || !n.baseY || isNaN(n.baseX) || isNaN(n.baseY)) {
                    return;
                }

                // Gentle floating motion using sine waves
                const offsetX = Math.sin(animationTime * n.floatSpeed + n.floatPhase) * n.floatAmplitude;
                const offsetY = Math.cos(animationTime * n.floatSpeed * 0.7 + n.floatPhase) * n.floatAmplitude * 0.8;

                // Update node position with floating offset
                const nodeElement = node.filter((d) => d.id === n.id);
                if (nodeElement.size() > 0) {
                    const currentX = n.baseX + offsetX;
                    const currentY = n.baseY + offsetY;
                    nodeElement
                        .attr("cx", currentX)
                        .attr("cy", currentY);

                    // Update label position to follow the floating node
                    const labelElement = nodeLabels.filter((d) => d.id === n.id);
                    if (labelElement.size() > 0) {
                        labelElement
                            .attr("x", currentX)
                            .attr("y", currentY + radius(n.totalCollaborations) + 15);
                    }
                }
            });

            requestAnimationFrame(animateFloat);
        }

        // Start the floating animation
        animateFloat();

        // Add event handlers to nodes
        node
            .on("mouseenter", (event, d) => {
                // Pause floating animation for this node
                hoveredNodeId = d.id;

                // Reset node to base position (ensure valid values)
                const baseX = (d.baseX !== undefined && !isNaN(d.baseX)) ? d.baseX : (d.x !== undefined && !isNaN(d.x) ? d.x : centerX);
                const baseY = (d.baseY !== undefined && !isNaN(d.baseY)) ? d.baseY : (d.y !== undefined && !isNaN(d.y) ? d.y : centerY);
                node.filter((n) => n.id === d.id)
                    .attr("cx", baseX)
                    .attr("cy", baseY);

                // Update label position
                nodeLabels.filter((n) => n.id === d.id)
                    .attr("x", baseX)
                    .attr("y", baseY + radius(d.totalCollaborations) + 15);

                // Tooltip (show name only on hover)
                tooltip
                    .style("opacity", 1)
                    .attr("aria-hidden", "false")
                    .html(
                        `<div style="font-weight:700;font-size:13px;margin-bottom:4px;">
              ${escapeHtml(d.name)}
            </div>
            <div>ID: <strong>${escapeHtml(d.id)}</strong></div>
            <div>Songs: <strong>${d.edgeCount}</strong></div>
            <div>Collaborations: <strong>${d.totalCollaborations}</strong></div>
            <div style="opacity:.75;margin-top:6px;">Click to focus sub-network</div>`
                    );

                moveTooltip(event);

                // Only show hover effects if not in sub-network mode
                if (!isSubNetworkMode) {
                    // Get 1-hop neighborhood
                    const neigh = neighbors.get(d.id) ?? new Set([d.id]);

                    // Show edges connected to this node
                    link
                        .style("opacity", (l) => {
                            const a = typeof l.source === "object" ? l.source.id : (l.sourceId || l.source);
                            const b = typeof l.target === "object" ? l.target.id : (l.targetId || l.target);
                            return (neigh.has(a) && neigh.has(b)) ? 0.6 : 0;
                        })
                        .transition()
                        .duration(200)
                        .style("opacity", (l) => {
                            const a = typeof l.source === "object" ? l.source.id : (l.sourceId || l.source);
                            const b = typeof l.target === "object" ? l.target.id : (l.targetId || l.target);
                            return (neigh.has(a) && neigh.has(b)) ? 0.6 : 0;
                        });

                    // Fade nodes not in neighborhood
                    node.classed("faded", (n) => !neigh.has(n.id));
                }

                // Glow hovered node
                node.classed("node-glow", (n) => n.id === d.id);
            })
            .on("mousemove", (event) => moveTooltip(event))
            .on("mouseleave", () => {
                // Resume floating animation
                hoveredNodeId = null;

                tooltip.style("opacity", 0).attr("aria-hidden", "true");

                // Only reset hover effects if not in sub-network mode
                if (!isSubNetworkMode) {
                    // Hide all edges again
                    link
                        .transition()
                        .duration(200)
                        .style("opacity", 0);

                    // Reset fade + glow (but keep selection styling if any)
                    node.classed("faded", false).classed("node-glow", false);
                } else {
                    // Just remove glow, keep sub-network state
                    node.classed("node-glow", false);
                }
            })
            .on("click", (event, d) => {
                // prevent zoom drag from also triggering click weirdness
                event.stopPropagation();

                selectedId = d.id;
                showDetailsFor(d.id);
                showSubNetwork(d.id);

                // Visually indicate selected node
                node.classed("node-selected", (n) => n.id === selectedId);
            });

        // Clicking the empty canvas restores full network view
        svg.on("click", (event) => {
            // Only trigger if clicking directly on the SVG background, not on nodes/links/buttons
            const target = event.target;
            // If clicking on a node (circle), link (line), or button, don't restore - those have their own handlers
            if (target.tagName !== 'circle' && target.tagName !== 'line' && target.tagName !== 'button') {
                showFullNetwork();
                details.style.display = "none";
            }
        });

        // -----------------------------
        // Initial radial layout: larger nodes (more collaborations) in center
        // -----------------------------
        const centerX = w() / 2;
        const centerY = h() / 2;
        const sortedNodes = [...nodes].sort((a, b) => b.totalCollaborations - a.totalCollaborations);

        sortedNodes.forEach((n, i) => {
            if (i === 0) {
                // Largest node (most collaborations) at center
                n.x = centerX;
                n.y = centerY;
            } else {
                // Arrange others in concentric circles based on collaboration count
                const angle = (i * 2 * Math.PI) / (sortedNodes.length - 1);
                const baseRadius = 50 + Math.sqrt(i) * 15;
                const radiusVariation = (n.totalCollaborations / maxCollaborations) * 30;
                const r = baseRadius + radiusVariation;
                n.x = centerX + r * Math.cos(angle);
                n.y = centerY + r * Math.sin(angle);
            }
            // Initialize base positions after setting x/y
            n.baseX = n.x;
            n.baseY = n.y;
        });

        // -----------------------------
        // Force simulation (without link force initially)
        // -----------------------------
        const sim = d3
            .forceSimulation(nodes)
            .force("charge", d3.forceManyBody().strength(-50))
            .force("center", d3.forceCenter(centerX, centerY).strength(0.1))
            .force("collide", d3.forceCollide().radius((d) => radius(d.totalCollaborations) + 8))
            .alphaDecay(0.05)
            .velocityDecay(0.6);

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
            // Update link positions (even if hidden)
            link
                .attr("x1", (d) => {
                    const source = typeof d.source === "object" ? d.source : nodeById.get(d.sourceId);
                    return source?.x ?? 0;
                })
                .attr("y1", (d) => {
                    const source = typeof d.source === "object" ? d.source : nodeById.get(d.sourceId);
                    return source?.y ?? 0;
                })
                .attr("x2", (d) => {
                    const target = typeof d.target === "object" ? d.target : nodeById.get(d.targetId);
                    return target?.x ?? 0;
                })
                .attr("y2", (d) => {
                    const target = typeof d.target === "object" ? d.target : nodeById.get(d.targetId);
                    return target?.y ?? 0;
                });

            // Update base positions for floating animation
            // Note: Node positions are handled by the floating animation, not directly here
            nodes.forEach((n) => {
                // Only update if x/y are valid numbers
                if (n.x !== undefined && !isNaN(n.x) && n.y !== undefined && !isNaN(n.y)) {
                    n.baseX = n.x;
                    n.baseY = n.y;
                }
            });

            // Update label positions to follow nodes (for all labels, not just visible ones)
            nodeLabels
                .each((d) => {
                    // Get current node position from the actual rendered element
                    const nodeElement = node.filter((n) => n.id === d.id);
                    if (nodeElement.size() > 0) {
                        const cx = parseFloat(nodeElement.attr("cx"));
                        const cy = parseFloat(nodeElement.attr("cy"));
                        if (!isNaN(cx) && !isNaN(cy) && isFinite(cx) && isFinite(cy)) {
                            d.x = cx;
                            d.y = cy;
                        } else {
                            // Fallback to node data
                            const nodeData = nodes.find(n => n.id === d.id);
                            if (nodeData) {
                                const fallbackX = nodeData.baseX || nodeData.x;
                                const fallbackY = nodeData.baseY || nodeData.y;
                                d.x = (fallbackX !== undefined && !isNaN(fallbackX)) ? fallbackX : centerX;
                                d.y = (fallbackY !== undefined && !isNaN(fallbackY)) ? fallbackY : centerY;
                            } else {
                                d.x = centerX;
                                d.y = centerY;
                            }
                        }
                    } else {
                        // Fallback to node data
                        const nodeData = nodes.find(n => n.id === d.id);
                        if (nodeData) {
                            const fallbackX = nodeData.baseX || nodeData.x;
                            const fallbackY = nodeData.baseY || nodeData.y;
                            d.x = (fallbackX !== undefined && !isNaN(fallbackX)) ? fallbackX : centerX;
                            d.y = (fallbackY !== undefined && !isNaN(fallbackY)) ? fallbackY : centerY;
                        } else {
                            d.x = centerX;
                            d.y = centerY;
                        }
                    }
                })
                .attr("x", (d) => {
                    const x = (d.x !== undefined && !isNaN(d.x) && isFinite(d.x)) ? d.x : centerX;
                    return x;
                })
                .attr("y", (d) => {
                    const y = ((d.y !== undefined && !isNaN(d.y) && isFinite(d.y)) ? d.y : centerY) + radius(d.totalCollaborations) + 15;
                    return y;
                });
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
