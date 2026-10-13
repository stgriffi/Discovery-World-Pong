"""Export TYLER's networks for the neural-net visualizer. Runs during the image build.

The visualizer draws the networks the AI is actually playing with, so this reads the same
model files as ai-paddle-control (dw Config.AI_MODELS, in shared/validation) and writes
easy.js, medium.js and hard.js (levels 1-3), each defining

    const easy_model = [hidden kernel (7680 x 200), hidden bias (200),
                        output kernel (200 x 3), output bias (3)];

Rows of the hidden kernel follow the input frame's pixels row-major (80 x 96), the same
order as the frames in ai/activation. Weights are written with 4 significant digits.

Usage: python export_weights.py <dw/config.py> <validation dir> <output dir>
"""
import importlib.util
import os
import sys

import h5py
import numpy as np

NAMES = {1: 'easy', 2: 'medium', 3: 'hard'}
SHAPES = [(7680, 200), (200,), (200, 3), (3,)]


def load_config(path):
    """dw's Config, loaded straight from its file (the rest of dw needs the MQTT libraries)."""
    spec = importlib.util.spec_from_file_location('dw_config', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.Config()


def read_weights(path):
    """[kernel, bias] of each layer, in order, from a Keras save_weights() .h5 file."""
    text = lambda s: s.decode() if isinstance(s, bytes) else s
    weights = []
    with h5py.File(path, 'r') as f:
        for layer in f.attrs['layer_names']:
            group = f[text(layer)]
            for name in group.attrs.get('weight_names', []):
                weights.append(np.array(group[text(name)]))
    return weights


def js_array(values):
    if values.ndim == 1:
        return '[' + ','.join('%.4g' % v for v in values) + ']'
    return '[' + ','.join(js_array(row) for row in values) + ']'


def main(config_path, validation_dir, out_dir):
    config = load_config(config_path)
    os.makedirs(out_dir, exist_ok=True)
    for level, name in NAMES.items():
        model = config.AI_MODELS[level]
        weights = read_weights(os.path.join(validation_dir, model))
        shapes = [w.shape for w in weights]
        if shapes != SHAPES:
            sys.exit(f'{model}: layer shapes {shapes}, but the visualizer draws {SHAPES}')
        with open(os.path.join(out_dir, f'{name}.js'), 'w') as out:
            out.write(f'// Generated from validation/{model} (level {level}) by export_weights.py\n')
            out.write(f'const {name}_model = [{",".join(js_array(w) for w in weights)}];\n')
        print(f'level {level}: {model} -> {name}.js')


if __name__ == '__main__':
    main(*sys.argv[1:4])
