document.addEventListener('DOMContentLoaded', () => {
    class GraphEditor {
        constructor() {
            this.elements = {
                canvas: document.getElementById('graphCanvas'), canvasContainer: document.getElementById('canvas-container'),
                outputArea: document.getElementById('outputArea'), generateGridBtn: document.getElementById('generateGridBtn'),
                copyBtn: document.getElementById('copyBtn'), clearBtn: document.getElementById('clearBtn'),
                addTextBtn: document.getElementById('addTextBtn'), saveProjectBtn: document.getElementById('saveProjectBtn'),
                loadProjectBtn: document.getElementById('loadProjectBtn'), loadProjectInput: document.getElementById('loadProjectInput'),
                mainGridLabelInput: document.getElementById('mainGridLabel'), graphLabelInput: document.getElementById('graphLabel'),
                scaleSlider: document.getElementById('scaleSlider'), scaleValue: document.getElementById('scaleValue'),
                verticesList: document.getElementById('vertices-list'), edgesList: document.getElementById('edges-list'),
                textsList: document.getElementById('texts-list'), paletteList: document.getElementById('palette-list'),
                newColorName: document.getElementById('newColorName'), newColorPicker: document.getElementById('newColorPicker'),
                newColorRgb: document.getElementById('newColorRgb'), addColorBtn: document.getElementById('addColorBtn'),
                savePaletteBtn: document.getElementById('savePaletteBtn'), tabsContainer: document.getElementById('tabs-container'),
                notification: document.getElementById('notification'),
                infoBtn: document.getElementById('infoBtn'), infoModal: document.getElementById('infoModal'),
                closeInfoBtn: document.getElementById('closeInfoBtn')
            };
            this.ctx = this.elements.canvas.getContext('2d');
            this.vertexRadius = 20;
            this.snapThreshold = 10;
            
            this.state = {
                graphs: [], activeGraphIndex: 0, palette: [], textMode: false,
                draggingElement: null, edgeStartElement: null, 
                mouse: { screen: {x: 0, y: 0}, world: {x: 0, y: 0}, isDown: false },
                view: { scale: 1.0, offsetX: 0, offsetY: 0, isPanning: false, panStart: {x: 0, y: 0} },
                snapLines: { active: false, x: [], y: [], midpoints: [], activeX: null, activeY: null, activeMidpoint: null }
            };
        }

        async init() {
            this.bindEventListeners();
            try {
                const response = await fetch('/get_colors');
                this.state.palette = await response.json();
            } catch (error) { this.showNotification("Error loading palette", 'error'); }
            if (this.state.graphs.length === 0) { this.addNewGraph(); }
            
            this.resizeCanvas();
            this.updateUI();
        }

        bindEventListeners() {
            const el = this.elements;
            window.addEventListener('resize', this.resizeCanvas.bind(this));
            el.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
            el.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
            el.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
            el.canvas.addEventListener('mouseout', this.handleMouseUp.bind(this));
            el.canvas.addEventListener('dblclick', this.handleDblClick.bind(this));
            el.canvas.addEventListener('wheel', this.handleWheel.bind(this));
            
            el.verticesList.addEventListener('input', e => this.handleElementPropertyChange(e, 'vertices'));
            el.edgesList.addEventListener('input', e => this.handleElementPropertyChange(e, 'edges'));
            el.textsList.addEventListener('input', e => this.handleElementPropertyChange(e, 'textNodes'));
            el.verticesList.addEventListener('click', e => this.handleElementDelete(e, 'vertices'));
            el.edgesList.addEventListener('click', e => this.handleElementDelete(e, 'edges'));
            el.textsList.addEventListener('click', e => this.handleElementDelete(e, 'textNodes'));

            el.infoBtn.addEventListener('click', () => el.infoModal.classList.remove('hidden'));
            el.closeInfoBtn.addEventListener('click', () => el.infoModal.classList.add('hidden'));
            el.infoModal.addEventListener('click', (e) => { if (e.target === el.infoModal) el.infoModal.classList.add('hidden'); });

            el.generateGridBtn.addEventListener('click', this.generateGrid.bind(this));
            el.copyBtn.addEventListener('click', this.copyToClipboard.bind(this));
            el.clearBtn.addEventListener('click', this.clearActiveGraph.bind(this));
            el.addTextBtn.addEventListener('click', this.toggleTextMode.bind(this));
            el.saveProjectBtn.addEventListener('click', this.saveProject.bind(this));
            el.loadProjectBtn.addEventListener('click', () => el.loadProjectInput.click());
            el.loadProjectInput.addEventListener('change', this.loadProject.bind(this));
            el.graphLabelInput.addEventListener('input', e => this.getActiveGraph().options.label = e.target.value);
            el.scaleSlider.addEventListener('input', e => {
                this.getActiveGraph().options.scale = parseFloat(e.target.value);
                el.scaleValue.textContent = this.getActiveGraph().options.scale.toFixed(1);
            });
            el.newColorPicker.addEventListener('input', e => {
                const hex = e.target.value;
                el.newColorRgb.value = `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
            });
            el.addColorBtn.addEventListener('click', this.addColor.bind(this));
            el.savePaletteBtn.addEventListener('click', this.savePalette.bind(this));
            el.paletteList.addEventListener('click', this.handlePaletteListClick.bind(this));
            el.tabsContainer.addEventListener('click', this.handleTabClick.bind(this));
            el.tabsContainer.addEventListener('dblclick', this.handleTabDblClick.bind(this));
        }
        
        resizeCanvas() {
            this.elements.canvas.width = this.elements.canvasContainer.clientWidth;
            this.elements.canvas.height = this.elements.canvasContainer.clientHeight;
            this.draw();
        }
        
        screenToWorld(x, y) {
            const { offsetX, offsetY, scale } = this.state.view;
            return { x: (x - offsetX) / scale, y: (y - offsetY) / scale };
        }

        updateMousePos(e) {
            const rect = this.elements.canvas.getBoundingClientRect();
            this.state.mouse.screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            this.state.mouse.world = this.screenToWorld(this.state.mouse.screen.x, this.state.mouse.screen.y);
        }

        handleWheel(e) {
            e.preventDefault();
            const { scale } = this.state.view;
            const zoomFactor = 1.1;
            const newScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
            const clampedScale = Math.max(0.1, Math.min(newScale, 5));
            const mouseWorldBeforeZoom = this.state.mouse.world;
            this.state.view.scale = clampedScale;
            this.updateMousePos(e);
            const mouseWorldAfterZoom = this.state.mouse.world;
            this.state.view.offsetX += (mouseWorldAfterZoom.x - mouseWorldBeforeZoom.x) * clampedScale;
            this.state.view.offsetY += (mouseWorldAfterZoom.y - mouseWorldBeforeZoom.y) * clampedScale;
            this.draw();
        }
        
        handleMouseDown(e) {
            this.state.mouse.isDown = true;
            this.updateMousePos(e);

            if (e.buttons === 4 || (e.altKey && e.buttons === 1) ) {
                this.state.view.isPanning = true;
                this.state.view.panStart = { ...this.state.mouse.screen };
                this.elements.canvas.classList.add('panning');
                return;
            }

            const clickedElement = this.getConnectableElementAt(this.state.mouse.world.x, this.state.mouse.world.y);
            
            if (e.shiftKey && clickedElement) {
                this.state.edgeStartElement = clickedElement;
            } else if (clickedElement) {
                this.state.draggingElement = { type: clickedElement.type, id: clickedElement.id };
                this.calculateSnapLines();
            }
            this.draw();
        }

        handleMouseMove(e) {
            this.updateMousePos(e);
            if (this.state.view.isPanning && this.state.mouse.isDown) {
                const dx = this.state.mouse.screen.x - this.state.view.panStart.x;
                const dy = this.state.mouse.screen.y - this.state.view.panStart.y;
                this.state.view.offsetX += dx;
                this.state.view.offsetY += dy;
                this.state.view.panStart = { ...this.state.mouse.screen };
            } else if (this.state.draggingElement) {
                const { x: worldX, y: worldY } = this.state.mouse.world;
                const { x, y } = this.getSnappedCoords(worldX, worldY);
                const graph = this.getActiveGraph();
                const elemType = this.state.draggingElement.type === 'vertex' ? 'vertices' : 'textNodes';
                const element = graph[elemType].find(el => el.id === this.state.draggingElement.id);
                if (element) { element.x = x; element.y = y; }
            }
            this.draw();
        }

        handleMouseUp(e) {
            if (!this.state.mouse.isDown) return;
            this.state.mouse.isDown = false;
            if (this.state.view.isPanning) {
                this.state.view.isPanning = false;
                this.elements.canvas.classList.remove('panning');
                return;
            }
            const onElement = this.getConnectableElementAt(this.state.mouse.world.x, this.state.mouse.world.y);
            if (this.state.edgeStartElement && onElement && onElement.id !== this.state.edgeStartElement.id) {
                this.createEdge(this.state.edgeStartElement.id, onElement.id);
            } else if (this.state.textMode) {
                this.createText();
            } else if (!this.state.draggingElement && !this.state.edgeStartElement && !e.shiftKey && !onElement) {
                this.createVertex();
            }
            this.state.draggingElement = null;
            this.state.edgeStartElement = null;
            this.state.snapLines.active = false;
            this.updateUI();
        }
        
        handleDblClick(e){
            this.updateMousePos(e);
            const clickedElement = this.getConnectableElementAt(this.state.mouse.world.x, this.state.mouse.world.y);
            
            if (!clickedElement) return;

            if(e.shiftKey && clickedElement.type === 'vertex') {
                this.createEdge(clickedElement.id, clickedElement.id);
            } else if(clickedElement.type === 'textNode') {
                const newText = prompt("Edit text:", clickedElement.text);
                if (newText !== null) {
                    clickedElement.text = newText;
                }
            }
            this.updateUI();
        }

        updateUI(){
            const graph = this.getActiveGraph();
            if(graph) {
                this.draw();
                this.updateTabs();
                this.updateGraphOptions();
                this.updateElementLists();
                this.updatePaletteList();
            }
        }

        getActiveGraph = () => this.state.graphs[this.state.activeGraphIndex];

        draw() {
            const graph = this.getActiveGraph();
            if (!graph) return;

            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
            ctx.save();
            ctx.translate(this.state.view.offsetX, this.state.view.offsetY);
            ctx.scale(this.state.view.scale, this.state.view.scale);

            this.drawSnapLines();
            
            // Draw temporary edge
            if (this.state.edgeStartElement) {
                ctx.save();
                ctx.strokeStyle = '#F87171';
                ctx.lineWidth = 2 / this.state.view.scale;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(this.state.edgeStartElement.x, this.state.edgeStartElement.y);
                ctx.lineTo(this.state.mouse.world.x, this.state.mouse.world.y);
                ctx.stroke();
                ctx.restore();
            }

            const allConnectables = [...graph.vertices, ...graph.textNodes];

            graph.edges.forEach(edge => {
                const v1 = allConnectables.find(el => el.id === edge.from);
                const v2 = allConnectables.find(el => el.id === edge.to);
                if (!v1 || !v2) return;

                ctx.save();
                ctx.lineWidth = 2 / this.state.view.scale;
                ctx.strokeStyle = edge.color ? `rgb(${edge.color})` : '#4A5568';
                if (edge.style === 'dashed') ctx.setLineDash([5, 5]);
                else if (edge.style === 'dotted') ctx.setLineDash([2, 3]);

                ctx.beginPath();
                let controlPoint = null;
                if (v1 === v2) {
                    const angle = { above: -Math.PI/2, below: Math.PI/2, left: Math.PI, right: 0 }[edge.loopPosition || 'above'];
                    const loopRadius = 1.8 * this.vertexRadius;
                    ctx.arc(v1.x + loopRadius * Math.cos(angle), v1.y + loopRadius * Math.sin(angle), loopRadius, 0, 2 * Math.PI);
                } else if (edge.bend) {
                    const midX = (v1.x + v2.x) / 2, midY = (v1.y + v2.y) / 2;
                    const dx = v2.x - v1.x, dy = v2.y - v1.y;
                    const len = Math.hypot(dx, dy);
                    const controlX = midX - dy/len * edge.bend;
                    const controlY = midY + dx/len * edge.bend;
                    controlPoint = { x: controlX, y: controlY };
                    ctx.moveTo(v1.x, v1.y);
                    ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, v2.x, v2.y);
                } else {
                    ctx.moveTo(v1.x, v1.y);
                    ctx.lineTo(v2.x, v2.y);
                }
                ctx.stroke();
                if (edge.direction === 'to') this.drawArrowhead(v1, v2, ctx.strokeStyle, controlPoint);
                if (edge.direction === 'from') this.drawArrowhead(v2, v1, ctx.strokeStyle, controlPoint);
                ctx.restore();

                if (edge.label) {
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = `${12 / this.state.view.scale}px Inter`;
                    ctx.fillStyle = '#1E40AF';
                    const midX = (v1.x + v2.x) / 2, midY = (v1.y + v2.y) / 2;
                    ctx.translate(midX, midY);
                    let angle = controlPoint ? Math.atan2(v2.y - controlPoint.y, v2.x - controlPoint.x) : Math.atan2(v2.y - v1.y, v2.x - v1.x);
                    if (angle < -Math.PI / 2 || angle > Math.PI / 2) { angle += Math.PI; }
                    ctx.rotate(angle);
                    ctx.fillText(edge.label, 0, -10 / this.state.view.scale);
                    ctx.restore();
                }
            });

            graph.vertices.forEach(vertex => {
                ctx.save();
                ctx.lineWidth = (this.state.draggingElement?.id === vertex.id ? 4 : 2) / this.state.view.scale;
                ctx.strokeStyle = this.state.edgeStartElement?.id === vertex.id ? '#3B82F6' : '#1F2937';
                ctx.fillStyle = vertex.color ? `rgb(${vertex.color})` : '#93C5FD';
                
                const shapeRadius = (vertex.shape === 'square' || vertex.shape === 'triangle') ? this.vertexRadius * 0.95 : this.vertexRadius;
                ctx.beginPath();
                if (vertex.shape === 'square') {
                    ctx.rect(vertex.x - shapeRadius, vertex.y - shapeRadius, shapeRadius * 2, shapeRadius * 2);
                } else if (vertex.shape === 'triangle') {
                    ctx.moveTo(vertex.x + shapeRadius, vertex.y);
                    for(let i = 1; i <= 6; i++) {
                        const angle = i * 60 * Math.PI / 180;
                        ctx.lineTo(vertex.x + shapeRadius * Math.cos(angle), vertex.y + shapeRadius * Math.sin(angle));
                    }
                } else {
                    ctx.arc(vertex.x, vertex.y, this.vertexRadius, 0, 2 * Math.PI);
                }
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = this.getContrastYIQ(vertex.color || '147,197,253');
                ctx.font = `bold ${14 / this.state.view.scale}px Inter`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const label = vertex.label || `v${vertex.id}`;
                ctx.fillText(label, vertex.x, vertex.y);
                ctx.restore();
            });

            graph.textNodes.forEach(textNode => {
                ctx.save();
                ctx.font = `${14 / this.state.view.scale}px Inter`;
                ctx.fillStyle = textNode.color ? `rgb(${textNode.color})` : '#111827';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(textNode.text, textNode.x, textNode.y);
                ctx.restore();
            });

            ctx.restore();
        }

        drawSnapLines(){
            if (!this.state.snapLines.active) return;
            const { x, y, midpoints, activeX, activeY, activeMidpoint } = this.state.snapLines;
            const ctx = this.ctx;
            
            ctx.save();
            ctx.lineWidth = 0.5 / this.state.view.scale;
            ctx.strokeStyle = '#a5b4fc';
            x.forEach(coord => { ctx.beginPath(); ctx.moveTo(coord, -this.state.view.offsetY / this.state.view.scale); ctx.lineTo(coord, (this.elements.canvas.height - this.state.view.offsetY) / this.state.view.scale); ctx.stroke(); });
            y.forEach(coord => { ctx.beginPath(); ctx.moveTo(-this.state.view.offsetX / this.state.view.scale, coord); ctx.lineTo((this.elements.canvas.width - this.state.view.offsetX) / this.state.view.scale, coord); ctx.stroke(); });

            ctx.strokeStyle = '#6ee7b7';
            ctx.setLineDash([4 / this.state.view.scale, 4 / this.state.view.scale]);
            midpoints.forEach(mid => { ctx.beginPath(); ctx.moveTo(mid.v1.x, mid.v1.y); ctx.lineTo(mid.v2.x, mid.v2.y); ctx.stroke(); });
            ctx.setLineDash([]);
            
            ctx.fillStyle = '#ef4444';
            midpoints.forEach(mid => { ctx.beginPath(); ctx.arc(mid.x, mid.y, 3 / this.state.view.scale, 0, 2 * Math.PI); ctx.fill(); });

            ctx.lineWidth = 1 / this.state.view.scale;
            ctx.strokeStyle = '#4f46e5';
            if (activeX !== null) { ctx.beginPath(); ctx.moveTo(activeX, -this.state.view.offsetY / this.state.view.scale); ctx.lineTo(activeX, (this.elements.canvas.height - this.state.view.offsetY) / this.state.view.scale); ctx.stroke(); }
            if (activeY !== null) { ctx.beginPath(); ctx.moveTo(-this.state.view.offsetX / this.state.view.scale, activeY); ctx.lineTo((this.elements.canvas.width - this.state.view.offsetX) / this.state.view.scale, activeY); ctx.stroke(); }
            if (activeMidpoint) { ctx.beginPath(); ctx.moveTo(activeMidpoint.v1.x, activeMidpoint.v1.y); ctx.lineTo(activeMidpoint.v2.x, activeMidpoint.v2.y); ctx.stroke(); }
            ctx.restore();
        }

        drawArrowhead(from, to, color, controlPoint) {
            // If the target is a text node, its radius is 0, otherwise use vertexRadius
            const toRadius = to.shape ? this.vertexRadius : 0;
            const headlen = 10 / this.state.view.scale;
            const angle = controlPoint ? Math.atan2(to.y - controlPoint.y, to.x - controlPoint.x) : Math.atan2(to.y - from.y, to.x - from.x);
            
            if (Math.hypot(to.x - from.x, to.y - from.y) < toRadius * 1.5) return;

            const targetPoint = { x: to.x - toRadius * Math.cos(angle), y: to.y - toRadius * Math.sin(angle) };
            
            this.ctx.save();
            this.ctx.fillStyle = color;
            this.ctx.translate(targetPoint.x, targetPoint.y);
            this.ctx.rotate(angle);
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(-headlen, headlen / 2);
            this.ctx.lineTo(-headlen, -headlen / 2);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.restore();
        }

        calculateSnapLines() {
            this.state.snapLines = { active: true, x: [], y: [], midpoints: [], activeX: null, activeY: null, activeMidpoint: null };
            const allOtherElements = [];
            const activeGraph = this.getActiveGraph();

            this.state.graphs.forEach(g => {
                const elements = [...g.vertices, ...g.textNodes];
                elements.forEach(el => {
                    if (!this.state.draggingElement || el.id !== this.state.draggingElement.id || g !== activeGraph) {
                        allOtherElements.push(el);
                    }
                });
            });

            this.state.snapLines.x = [...new Set(allOtherElements.map(el => el.x))];
            this.state.snapLines.y = [...new Set(allOtherElements.map(el => el.y))];

            for (let i = 0; i < allOtherElements.length; i++) {
                for (let j = i + 1; j < allOtherElements.length; j++) {
                    const v1 = allOtherElements[i]; const v2 = allOtherElements[j];
                    this.state.snapLines.midpoints.push({ x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2, v1, v2 });
                }
            }
        }

        getSnappedCoords(worldX, worldY) {
            let snappedX = worldX, snappedY = worldY;
            this.state.snapLines.activeX = null;
            this.state.snapLines.activeY = null;
            this.state.snapLines.activeMidpoint = null;

            const snapDistance = this.snapThreshold / this.state.view.scale;

            for (const mid of this.state.snapLines.midpoints) {
                if (Math.hypot(worldX - mid.x, worldY - mid.y) < snapDistance) {
                    snappedX = mid.x; snappedY = mid.y;
                    this.state.snapLines.activeMidpoint = mid;
                    return { x: snappedX, y: snappedY };
                }
            }
            for (const coord of this.state.snapLines.x) {
                if (Math.abs(worldX - coord) < snapDistance) {
                    snappedX = coord;
                    this.state.snapLines.activeX = coord;
                    break;
                }
            }
            for (const coord of this.state.snapLines.y) {
                if (Math.abs(worldY - coord) < snapDistance) {
                    snappedY = coord;
                    this.state.snapLines.activeY = coord;
                    break;
                }
            }
            return { x: snappedX, y: snappedY };
        }
        
        getNewNodeId() {
            const graph = this.getActiveGraph();
            const maxVertexId = graph.vertices.length > 0 ? Math.max(...graph.vertices.map(v => v.id)) : 0;
            const maxTextId = graph.textNodes.length > 0 ? Math.max(...graph.textNodes.map(t => t.id)) : 0;
            return Math.max(maxVertexId, maxTextId) + 1;
        }

        handleTabClick(e) { const tab = e.target.closest('.tab'); if (!tab) return; if (e.target.closest('.tab-delete')) { e.preventDefault(); e.stopPropagation(); this.deleteGraph(parseInt(e.target.closest('.tab-delete').dataset.index)); } else if (tab.id === 'add-tab-btn') { e.preventDefault(); this.addNewGraph(); } else if (tab.dataset.index) { this.switchTab(parseInt(tab.dataset.index)); } }
        handleTabDblClick(e) { const tab = e.target.closest('.tab[data-index]'); if (!tab) return; const graph = this.state.graphs[parseInt(tab.dataset.index)]; const newName = prompt('Rename graph:', graph.name); if (newName) { graph.name = newName.trim(); graph.options.label = newName.trim(); this.updateUI(); } }
        createVertex() { const graph = this.getActiveGraph(); const nextId = this.getNewNodeId(); graph.vertices.push({ id: nextId, x: this.state.mouse.world.x, y: this.state.mouse.world.y, label: '', color: null, shape: 'circle' }); }
        createEdge(fromId, toId) { const graph = this.getActiveGraph(); const nextId = graph.edges.length > 0 ? Math.max(...graph.edges.map(e => e.id)) + 1 : 1; graph.edges.push({ id: nextId, from: fromId, to: toId, label: '', color: null, style: 'solid', direction: 'none', bend: 0 }); }
        createText() { const text = prompt('Enter the text:'); if (text) { const graph = this.getActiveGraph(); const nextId = this.getNewNodeId(); graph.textNodes.push({ id: nextId, text: text, x: this.state.mouse.world.x, y: this.state.mouse.world.y, color: null }); } this.toggleTextMode(); }
        addNewGraph() { const newName = this.getNewGraphName(); this.state.graphs.push({ name: newName, vertices: [], edges: [], textNodes: [], options: { label: newName, scale: 0.5 } }); this.switchTab(this.state.graphs.length - 1); }
        deleteGraph(index) { if (this.state.graphs.length <= 1) { this.showNotification('Cannot delete the last graph.', 'error'); return; } if (confirm(`Are you sure you want to delete "${this.state.graphs[index].name}"?`)) { this.state.graphs.splice(index, 1); if (this.state.activeGraphIndex >= this.state.graphs.length) { this.state.activeGraphIndex = this.state.graphs.length - 1; } this.updateUI(); } }
        clearActiveGraph() { if (confirm('Are you sure you want to clear the active graph?')) { Object.assign(this.getActiveGraph(), { vertices: [], edges: [], textNodes: [] }); this.updateUI(); } }
        switchTab(index) { if (index !== this.state.activeGraphIndex) { this.state.activeGraphIndex = index; this.updateUI(); } }
        toggleTextMode() { this.state.textMode = !this.state.textMode; this.elements.addTextBtn.classList.toggle('active', this.state.textMode); this.elements.canvas.classList.toggle('text-mode', this.state.textMode); }
        getVertexAt(x, y) { return this.getActiveGraph()?.vertices.find(v => Math.hypot(v.x - x, v.y - y) <= this.vertexRadius); }
        getTextNodeAt(x, y) { return this.getActiveGraph()?.textNodes.find(tn => { const metrics = this.ctx.measureText(tn.text); const width = metrics.width / this.state.view.scale; const height = 14 / this.state.view.scale; return x >= tn.x - width / 2 && x <= tn.x + width / 2 && y >= tn.y - height / 2 && y <= tn.y + height / 2; }); }
        getConnectableElementAt(x, y) { const vertex = this.getVertexAt(x, y); if (vertex) return { ...vertex, type: 'vertex' }; const textNode = this.getTextNodeAt(x, y); if (textNode) return { ...textNode, type: 'textNode' }; return null; }
        getContrastYIQ = rgbStr => { if (!rgbStr) return '#000000'; const [r, g, b] = rgbStr.split(','); const yiq = ((parseInt(r) * 299) + (parseInt(g) * 587) + (parseInt(b) * 114)) / 1000; return yiq < 128 ? '#FFFFFF' : '#000000'; }
        showNotification(message, type = 'success') { const el = this.elements.notification; el.textContent = message; el.className = `notification show ${type === 'error' ? 'bg-red-500' : 'bg-green-500'}`; setTimeout(() => el.classList.remove('show'), 3000); }
        updateGraphOptions() { const { options } = this.getActiveGraph(); this.elements.graphLabelInput.value = options.label; this.elements.scaleSlider.value = options.scale; this.elements.scaleValue.textContent = options.scale.toFixed(1); }
        updateTabs() { this.elements.tabsContainer.innerHTML = this.state.graphs.map((g, i) => `<a class="tab ${i === this.state.activeGraphIndex ? 'active' : ''}" data-index="${i}" title="Double-click to rename"><span>${g.name}</span><span class="tab-delete" data-index="${i}" title="Delete graph">&times;</span></a>`).join('') + `<a id="add-tab-btn" class="tab font-bold text-blue-600" href="#">+</a>`; }
        updateElementLists() {
            const { vertices, edges, textNodes } = this.getActiveGraph();
            const colorSelect = el => `<select class="input-field text-xs py-0" data-property="color" data-id="${el.id}"><option value="">Default</option>${this.state.palette.map(p => `<option value="${p.rgb}" ${el.color === p.rgb ? 'selected' : ''}>${p.name}</option>`).join('')}</select>`;
            
            this.elements.verticesList.innerHTML = vertices.map(v => `
                <div class="p-1.5 rounded-md hover:bg-gray-100 border border-gray-200 space-y-2">
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-mono text-sm font-semibold">v${v.id}</span>
                        ${colorSelect(v)}
                        <button data-id="${v.id}" class="delete-btn text-red-500 hover:text-red-700 font-bold">&times;</button>
                    </div>
                    <input type="text" class="input-field text-xs py-1" data-property="label" data-id="${v.id}" value="${v.label || ''}" placeholder="Node Label (e.g. A)">
                    <select class="input-field text-xs py-0 mt-1" data-property="shape" data-id="${v.id}">
                        <option value="circle" ${v.shape !== 'square' && v.shape !== 'triangle' ? 'selected' : ''}>Circle</option>
                        <option value="square" ${v.shape === 'square' ? 'selected' : ''}>Square</option>
                        <option value="triangle" ${v.shape === 'triangle' ? 'selected' : ''}>Hexagon</option>
                    </select>
                </div>
            `).join('') || '<p class="text-xs text-gray-500">No vertices.</p>';

            this.elements.edgesList.innerHTML = edges.map(e => `
                <div class="p-1.5 rounded-md hover:bg-gray-100 border border-gray-200 space-y-2">
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-mono text-sm font-semibold">${e.from === e.to ? `Loop ${e.from}` : `${e.from} &mdash; ${e.to}`}</span>
                        ${colorSelect(e)}
                        <button data-id="${e.id}" class="delete-btn text-red-500 hover:text-red-700 font-bold">&times;</button>
                    </div>
                    <input type="text" class="input-field text-xs py-1" data-property="label" data-id="${e.id}" value="${e.label || ''}" placeholder="Label">
                    <div class="flex items-center justify-between gap-2 text-xs">
                        <select class="input-field py-0" data-property="style" data-id="${e.id}">${['solid', 'dashed', 'dotted'].map(s => `<option value="${s}" ${e.style === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}</select>
                        <select class="input-field py-0" data-property="direction" data-id="${e.id}">${Object.entries({ none: '--', to: '->', from: '<-' }).map(([k, v]) => `<option value="${k}" ${e.direction === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
                        ${e.from === e.to ? `<select class="input-field py-0" data-property="loopPosition" data-id="${e.id}">${['above', 'below', 'left', 'right'].map(p => `<option value="${p}" ${e.loopPosition === p ? 'selected' : ''}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join('')}</select>` : `<input type="number" class="input-field py-0 w-16" data-property="bend" data-id="${e.id}" value="${e.bend || 0}" step="5" title="Bend">`}
                    </div>
                </div>
            `).join('') || '<p class="text-xs text-gray-500">No edges.</p>';
            
            this.elements.textsList.innerHTML = textNodes.map(t => `
                <div class="p-1.5 rounded-md hover:bg-gray-100 border border-gray-200 space-y-2">
                    <div class="flex items-center justify-between gap-2">
                         <span class="font-mono text-sm font-semibold">T${t.id}</span>
                        ${colorSelect(t)}
                        <button data-id="${t.id}" class="delete-btn text-red-500 hover:text-red-700 font-bold">&times;</button>
                    </div>
                    <input type="text" class="input-field text-xs py-1" data-property="text" data-id="${t.id}" value="${t.text || ''}" placeholder="Text content">
                </div>
            `).join('') || '<p class="text-xs text-gray-500">No texts.</p>';
        }
        updatePaletteList(){ this.elements.paletteList.innerHTML = this.state.palette.map((p, i) => `<div class="grid grid-cols-12 gap-2 items-center"><div class="col-span-1 w-5 h-5 rounded border" style="background-color:rgb(${p.rgb});"></div><input type="text" value="${p.name}" data-index="${i}" data-field="name" class="col-span-5 input-field input-field-sm py-1"><input type="text" value="${p.rgb}" data-index="${i}" data-field="rgb" class="col-span-5 input-field input-field-sm py-1"><button data-index="${i}" class="delete-color-btn text-red-500 hover:text-red-700 font-bold text-lg col-span-1">&times;</button></div>`).join(''); }
        handleElementPropertyChange(e, elementType) { const { id, property } = e.target.dataset; if (id === undefined || !property) return; const value = e.target.type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value; this.getActiveGraph()[elementType].find(el => el.id === parseInt(id))[property] = value; this.draw(); }
        handleElementDelete(e, elementType) { if (!e.target.matches('.delete-btn')) return; const idToDelete = parseInt(e.target.dataset.id); const graph = this.getActiveGraph(); graph[elementType] = graph[elementType].filter(el => el.id !== idToDelete); graph.edges = graph.edges.filter(edge => edge.from !== idToDelete && edge.to !== idToDelete); this.updateUI(); }
        addColor() { const name = this.elements.newColorName.value.trim(); const rgb = this.elements.newColorRgb.value.trim(); if (name && rgb.match(/^\d{1,3},\s*\d{1,3},\s*\d{1,3}$/)) { this.state.palette.push({ name: name, rgb: rgb.replace(/\s/g, '') }); this.updatePaletteList(); this.elements.newColorName.value = ''; this.elements.newColorRgb.value = ''; } else { this.showNotification('Invalid name or RGB format.', 'error'); } }
        async savePalette() { const newPalette = []; this.elements.paletteList.querySelectorAll('div.grid').forEach(row => { newPalette.push({ name: row.querySelector('[data-field="name"]').value, rgb: row.querySelector('[data-field="rgb"]').value }); }); this.state.palette = newPalette; try { await fetch('/save_colors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ palette: this.state.palette }) }); this.showNotification('Palette saved!', 'success'); this.updateUI(); } catch (error) { this.showNotification('Error saving the palette.', 'error'); } }
        handlePaletteListClick(e) { if (e.target.matches('.delete-color-btn')) { this.state.palette.splice(parseInt(e.target.dataset.index), 1); this.updatePaletteList(); } }
        saveProject() { const data = new Blob([JSON.stringify({ palette: this.state.palette, graphs: this.state.graphs }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(data); link.download = 'graph_project.json'; link.click(); URL.revokeObjectURL(link.href); this.showNotification('Project saved.', 'success'); }
        loadProject(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const data = JSON.parse(event.target.result); if (!data.graphs || !data.palette) throw new Error('Invalid file.'); this.state.graphs = data.graphs; this.state.palette = data.palette; this.state.activeGraphIndex = 0; this.updateUI(); this.showNotification('Project loaded successfully!', 'success'); } catch (err) { this.showNotification(`Load error: ${err.message}`, 'error'); } }; reader.readAsText(file); e.target.value = null; }
        async generateGrid() { this.elements.generateGridBtn.disabled = true; try { const response = await fetch('/generate_grid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graphs: this.state.graphs, main_caption: this.elements.mainGridLabelInput.value }) }); const result = await response.json(); this.elements.outputArea.value = result.error ? `ERROR: ${result.error}` : result.tikz_code; } catch (error) { this.elements.outputArea.value = `Connection ERROR: ${error.message}`; } finally { this.elements.generateGridBtn.disabled = false; } }
        copyToClipboard = () => navigator.clipboard.writeText(this.elements.outputArea.value).then(() => this.showNotification('Code copied!', 'success')).catch(() => this.showNotification('Copy error.', 'error'));
        getNewGraphName = () => `Graph ${this.state.graphs.reduce((max, g) => Math.max(max, parseInt(g.name.split(' ')[1]) || 0), 0) + 1}`;
    }
    new GraphEditor().init();
});
