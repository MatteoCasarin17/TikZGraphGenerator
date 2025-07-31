import webbrowser
import json
import csv
import os
import re
from threading import Timer
from flask import Flask, request, jsonify, render_template

# --- CONFIGURATION ---
APP_HOST = "127.0.0.1"
APP_PORT = 5000
COLOR_PALETTE_FILE = "colors.csv"

# Create the web application using Flask
app = Flask(__name__)

# --- COLOR PALETTE MANAGEMENT (ROBUST) ---
def get_color_palette():
    default_colors = [
        {'name': 'Node Blue', 'rgb': '147,197,253'}, {'name': 'Edge Gray', 'rgb': '74,85,104'},
        {'name': 'Error Red', 'rgb': '239,68,68'}, {'name': 'Success Green', 'rgb': '34,197,94'},
    ]
    if not os.path.exists(COLOR_PALETTE_FILE):
        save_color_palette(default_colors)
        return default_colors
    try:
        with open(COLOR_PALETTE_FILE, mode='r', newline='', encoding='utf-8') as f:
            palette = [{'name': rows[0], 'rgb': rows[1]} for rows in csv.reader(f) if len(rows) == 2]
        if not palette:
            save_color_palette(default_colors)
            return default_colors
        return palette
    except Exception:
        save_color_palette(default_colors)
        return default_colors

def save_color_palette(palette):
    with open(COLOR_PALETTE_FILE, mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        for color in palette:
            if isinstance(color, dict) and 'name' in color and 'rgb' in color:
                writer.writerow([color['name'], color['rgb']])

# --- LATEX HELPER FUNCTIONS ---
def get_contrast_yiq(rgb_string):
    if not rgb_string: return 'black'
    try:
        r, g, b = map(int, rgb_string.split(','))
        return 'white' if ((r * 299) + (g * 587) + (b * 114)) / 1000 < 128 else 'black'
    except (ValueError, IndexError): return 'black'

def generate_single_tikz(graph_data, all_used_colors):
    vertices, edges, text_nodes = graph_data.get('vertices', []), graph_data.get('edges', []), graph_data.get('textNodes', [])
    SCALE_FACTOR = 40.0
    
    def add_color_def(rgb_string, prefix, item_id):
        if not rgb_string: return ""
        palette_color = next((c for c in get_color_palette() if c['rgb'] == rgb_string), None)
        color_name = ''.join(filter(str.isalnum, palette_color['name'])) if palette_color else f"{prefix}{item_id}Color"
        all_used_colors[color_name] = rgb_string
        return color_name

    tikz_body = []
    
    # Combined list of connectable elements for ID lookup
    connectable_elements = {f"v_{v['id']}": 'v' for v in vertices}
    connectable_elements.update({f"t_{tn['id']}": 't' for tn in text_nodes})

    if vertices:
        tikz_body.append("% Nodes")
        for v in vertices:
            shape_style = "rectangularNode" if v.get('shape') == 'square' else "hexagonalNode" if v.get('shape') == 'triangle' else "node"
            options = [f"style={shape_style}", f"text={get_contrast_yiq(v.get('color'))}"]
            fill_color_name = add_color_def(v.get('color'), 'v', v['id'])
            if fill_color_name: options.append(f"fill={fill_color_name}")
            
            # Use custom label if provided, otherwise default to v_id
            node_label = v.get('label', '').strip()
            node_content = f"{{{node_label}}}" if node_label else f"{{$v_{{{v['id']}}}$}}"
            
            tikz_body.append(f"\\node[{', '.join(options)}] (v{v['id']}) at ({v['x']/SCALE_FACTOR:.3f},{-v['y']/SCALE_FACTOR:.3f}) {node_content};")

    if text_nodes:
        tikz_body.append("\n% Additional Text")
        for tn in text_nodes:
            opts = ["draw=none", "fill=none"]
            text_color_name = add_color_def(tn.get('color'), 't', tn['id'])
            if text_color_name:
                opts.append(f"text={text_color_name}")
            # Add a name to the text node to make it connectable
            tikz_body.append(f"\\node[{', '.join(opts)}] (t{tn['id']}) at ({tn['x']/SCALE_FACTOR:.3f},{-tn['y']/SCALE_FACTOR:.3f}) {{{tn.get('text', '').replace('_', '\\_')}}};")

    if edges:
        tikz_body.append("\n% Edges")
        for edge in edges:
            # Determine if from/to are vertices or text nodes
            from_type = connectable_elements.get(f"v_{edge['from']}", connectable_elements.get(f"t_{edge['from']}"))
            to_type = connectable_elements.get(f"v_{edge['to']}", connectable_elements.get(f"t_{edge['to']}"))
            
            # Skip edge if a connected element is missing
            if not from_type or not to_type:
                continue

            v_from = f"{from_type}{edge['from']}"
            v_to = f"{to_type}{edge['to']}"
            
            opts, label_node_str = [], ""
            
            direction = edge.get('direction', 'none')
            if direction == 'to': opts.append('->')
            elif direction == 'from': opts.append('<-')

            draw_color_name = add_color_def(edge.get('color'), 'e', edge['id'])
            if draw_color_name: opts.append(f"draw={draw_color_name}")
            if edge.get('style') in ['dashed', 'dotted']: opts.append(edge.get('style'))

            label = edge.get('label', '')
            if label:
                match = re.match(r'^([a-zA-Z]+)_?(\d+)$', label.strip())
                latex_label = f"${match.group(1)}_{{{match.group(2)}}}$" if match else f"{{{label.replace('_', ' ')}}}"
                label_node_str = f"node [auto, font=\\small, sloped] {{{latex_label}}}"

            if v_from == v_to:
                opts.extend([f"loop {edge.get('loopPosition', 'above')}", "looseness=20"])
                edge_cmd = f"\\draw [{','.join(opts)}] ({v_from}) to {label_node_str} ({v_from});"
            else:
                bend_val = edge.get('bend', 0)
                if bend_val != 0:
                    opts.append(f"bend {'right' if bend_val > 0 else 'left'}={abs(bend_val)}")
                edge_cmd = f"\\draw [{','.join(opts)}] ({v_from}) to {label_node_str} ({v_to});"
            tikz_body.append(edge_cmd)

    return "\n    ".join(tikz_body)

# --- FLASK ROUTES ---
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/get_colors')
def get_colors_route():
    return jsonify(get_color_palette())

@app.route('/save_colors', methods=['POST'])
def save_colors_route():
    save_color_palette(request.json.get('palette', []))
    return jsonify({'status': 'success'})

@app.route('/generate_grid', methods=['POST'])
def generate_grid():
    data = request.json
    graphs, main_caption = data.get('graphs', []), data.get('main_caption', '')
    if not graphs: return jsonify({'tikz_code': '% No graphs to generate.'})

    all_used_colors = {}
    subfig_width = round(1 / 2 - 0.05, 2)
    subfigures_code = []

    for graph_data in graphs:
        tikz_code = generate_single_tikz(graph_data, all_used_colors)
        caption = graph_data.get('options', {}).get('label', 'Graph')
        safe_label = re.sub(r'[^a-zA-Z0-9]', '', caption) or f"graph{graph_data.get('name', '')}"
        scale = graph_data.get('options', {}).get('scale', 1.0)
        
        subfigures_code.append(f"\\begin{{subfigure}}[t]{{{subfig_width}\\textwidth}}\n    \\centering\n    \\begin{{tikzpicture}}[scale={scale}]\n        {tikz_code}\n    \\end{{tikzpicture}}\n    \\caption{{{caption}}}\n    \\label{{fig:{safe_label}}}\n\\end{{subfigure}}")
    
    grid_str = "\n".join(subfigures_code)
    
    color_defs = [f"\\definecolor{{{name}}}{{RGB}}{{{rgb}}}" for name, rgb in all_used_colors.items()]
    
    tikz_styles = [
        "\\tikzstyle{node} = [draw, circle, minimum size=0.8cm, inner sep=0pt]",
        "\\tikzstyle{rectangularNode} = [draw, rectangle, minimum size=0.7cm, inner sep=2pt]",
        "\\tikzstyle{hexagonalNode} = [draw, regular polygon, regular polygon sides=6, minimum size=0.6cm, inner sep=1pt]"
    ]
    
    final_code_parts = []
    if color_defs: final_code_parts.extend(["% Custom color definitions"] + color_defs)
    final_code_parts.extend(["% Reusable TikZ styles"] + tikz_styles)
    
    safe_main_label = re.sub(r'[^a-zA-Z0-9]', '', main_caption) or "graphGrid"
    figure_content = [f"\\centering", grid_str]
    if main_caption:
        figure_content.append(f"\\caption{{{main_caption}}}")
        figure_content.append(f"\\label{{fig:{safe_main_label}}}")

    final_code_parts.append("\\begin{figure}[H]")
    final_code_parts.extend(figure_content)
    final_code_parts.append("\\end{figure}")
    
    return jsonify({'tikz_code': "\n".join(final_code_parts)})

def open_browser():
    webbrowser.open_new(f"http://{APP_HOST}:{APP_PORT}/")

if __name__ == '__main__':
    print(f"Starting local server at http://{APP_HOST}:{APP_PORT}/")
    Timer(1, open_browser).start()
    app.run(host=APP_HOST, port=APP_PORT, debug=False)
