/*
This class is a relatively straightforward set of utilities used in the inference visualization proof-of-concept.
*/
const TITLE_FONT = "30px Barlow";
const WEIGHT_COLOR = "#666666"
const WEIGHT_COLOR_ACTIVE = "#BB6666"
const NEURON_COLOR = "#000000"
const NEURON_COLOR_ACTIVE = "#DD2222"
const ACTIVE_WEIGHT_THRESHOLD = 1

// For benchmarking. Off by default: console.log goes out over MQTT, and every frame times
// several steps.
const LOG_TIMERS = false;
var timer = function (name) {
    var start = new Date();
    return {
        stop: function () {
            if (!LOG_TIMERS) return;
            var end = new Date();
            var time = end.getTime() - start.getTime();
            console.log('Timer:', name, 'finished in', time, 'ms');
        }
    }
};

// The following functions are essentially reimplementations of NumPy array operations on nested JavaScript arrays.
// Most are specific to 1D and 2D arrays.

function get_dims(array) {
    // Find number of dimensions
    base = array;
    dims = 0
    while (typeof (base) == "object") {
        base = base[0];
        dims++;
    }
    return dims;
}

function elementApply(array, lambda) {
    /*
    Apply function to every individual element in nested array structure
    (Base method for several numpy-esque helpers)
    */
    if (typeof (array) == "object") {
        // If the variable is an "object", we're dealing with a nested array - so recurse
        return array.map(subarray => elementApply(subarray, lambda));
    } else {
        // Base case: the array is actually a single element
        return lambda(array);
    }
}

function flatten(array) {
    const dims = get_dims(array);
    if (dims < 2) return array;
    if (dims > 2) throw "Flattening array > 2 dimensions not supported";
    flat = [];
    for (let i = 0; i < array.length; i++) {
        flat += array[i];
    }
    return flat;
}

function scale(array, scalar) {
    const dims = get_dims(array);
    // Fill in dims
    if (dims == 0) return array * scalar
    if (dims == 1) return array.map(x => x * scalar)
    if (dims == 2) return array.map(row => row.map(x => x * scalar))
    if (dims > 2) throw "Scaling array > 2 dimensions not supported"
}

function scale_inplace(array, scalar) {
    const dims = get_dims(array);
    if (dims == 2) {
        for (let i = 0; i < array.length; i++) {
            for (let j = 0; j < array[0].length; j++) {
                array[i][j] = scalar * array[i][j];
            }
        }
    } else if (dims == 1) {
        for (let i = 0; i < array.length; i++) {
            array[i] = scalar * array[i];
        }
    } else {
        throw ("Scale in place only supports 1d and 2d");
    }
}

function zeros_like(array) {
    return elementApply(array, x => 0);
}

function ones_like(array) {
    return elementApply(array, x => 1);
}

function arrayMin(arr) {
    return arr.reduce(function (p, v) {
        return (p < v ? p : v);
    });
}

function arrayMax(arr) {
    return arr.reduce(function (p, v) {
        return (p > v ? p : v);
    });
}

function abs(array) {
    return elementApply(array, Math.abs);
}

function add(array, shift) {
    return elementApply(array, x => x + shift);
}

function max(array) {
    const dims = get_dims(array);
    // Fill in dims
    if (dims == 0) return array
    if (dims == 1) return arrayMax(array)
    if (dims == 2) {
        let max = -100000000;
        for (let i = 0; i < array.length; i++) {
            for (let j = 0; j < array[0].length; j++) {
                if (array[i][j] > max) {
                    max = array[i][j];
                }
            }
        }
        return max;
    }
    if (dims > 2) throw "Max of array > 2 dimensions not supported"
}

function argmax(array) {
    const dims = get_dims(array);
    // Fill in dims
    if (dims == 0) return 0
    if (dims == 1) {
        let max = -100000000;
        let max_idx = -1;
        for (let i = 0; i < array.length; i++) {
            if (array[i] > max) {
                max = array[i];
                max_idx = i;
            }
        }
        return max_idx;
    }
    if (dims == 2) {
        let max = -100000000;
        let max_idx = -1;
        for (let i = 0; i < array.length; i++) {
            for (let j = 0; j < array[0].length; j++) {
                if (array[i][j] > max) {
                    max = array[i][j];
                    max_idx = [i, j];
                }
            }
        }
        return max_idx;
    }
    if (dims > 2) throw "Max of array > 2 dimensions not supported"
}

function min(array) {
    const dims = get_dims(array);
    // Fill in dims
    if (dims == 0) return array
    if (dims == 1) return arrayMin(array)
    if (dims == 2) {
        let min = 100000000000;
        for (let i = 0; i < array.length; i++) {
            for (let j = 0; j < array[0].length; j++) {
                if (array[i][j] < min) {
                    min = array[i][j];
                }
            }
        }
        return min;
    }
    if (dims > 2) throw "Max of array > 2 dimensions not supported"
}

function interOperate(a, b, lambda) {
    /*
    Given a and b are 2d arrays of the same size, return a new array of
    the same size using a mapping that takes both as inputs.
    */
    if (get_dims(a) !== 2 || get_dims(b) !== 2) {
        throw ("Interoperate only supports 2d arrays");
    }
    if (a.length !== b.length || a[0].length !== b[0].length) {
        throw ("Interoperate only supports arrays with matching dimensions");
    }
    const newArray = [];
    for (let i = 0; i < a.length; i++) {
        const newRow = [];
        for (let j = 0; j < a[0].length; j++) {
            newRow.push(lambda(a[i][j], b[i][j]));
        }
        newArray.push(newRow);
    }
    return newArray;
}

function argwhere(a) {
    // Returns array indices where true
    // Requires a 1d or 2d array
    const dims = get_dims(a);
    const indices = [];
    if (dims == 2) {
        for (let i = 0; i < a.length; i++) {
            for (let j = 0; j < a[0].length; j++) {
                if (a[i][j]) {
                    indices.push([i, j]);
                }
            }
        }
    }
    if (dims == 1) {
        for (let i = 0; i < a.length; i++) {
            if (a[i]) {
                indices.push(i);
            }
        }
    }
    return indices;
}

function and(a, b) {
    return interOperate(a, b, (a, b) => a && b);
}

function copy(a) {
    /*
     * Create a deep copy of the provided 1d or 2d array
     */
    const dims = get_dims(a);
    const new_a = [];
    if (dims == 2) {
        for (let i = 0; i < a.length; i++) {
            new_a.push([]);
            for (let j = 0; j < a[0].length; j++) {
                new_a[i].push(a[i][j]);
            }
        }
    }
    else if (dims == 1) {
        for (let i = 0; i < a.length; i++) {
            new_a.push(a[i]);
        }
    }
    return new_a;
}

// More general rendering utilities
function create_circle(x, y, r, ctx, color = NEURON_COLOR) {
    /*
    Draw a circle on the canvas
    :param x: x position
    :param y: y position
    :param r: radius
    :param ctx: HTML5 canvas context
    :param color: RGB color
    :return:
    */
    x0 = x - r;
    y0 = y - r;
    x1 = x + r;
    y1 = y + r;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = NEURON_COLOR;
    ctx.stroke();
};

function get_intensity(val) {
    /*
    Maps a float between 0 and 1 to a red-based color ranging from gray to bright red
    :param val: float between 0 and 1
    :return: Red color that is redder as val approaches 1
    */
    //val = hex(max(int(val * 255), 0x22))
    val = Math.floor(Math.max(val * 255, 34));
    redVal = val.toString(16);
    if (redVal.length == 1) {
        redVal = "0" + redVal;
    }
    color = "#" + redVal + "2222"
    return color
}

function get_weight_map(weights, neuron) {
    /*
    Extract a flattened image of the weights of a single neuron relative to each pixel in the input image
    weights: x by n weight matrix
    neuron: index of the neuron to extract weights from for each x
    */
    weight_map = []
    weight_map.length = weights.length
    for (let i = 0; i < weights.length; i++) {
        weight_map[i] = weights[i][neuron];
    }
    return weight_map;
}


function render_layer(canvas, neurons, left_x, right_x, y, neuron_size, activations = null, labels = null, activation_intensities = null) {
    // Scale and normalize biases around 1 to represent useful node scale factors (ranging from ~0.3 - ~1.7)
    neurons = abs(scale(neurons, 10));
    neurons = add(neurons, 0.1); // Ensure no neurons are zero-sized
    coordinates = [];
    padding = ((right_x - left_x) - (neurons.length * neuron_size)) / (neurons.length + 1);
    for (let i = 0; i < neurons.length; i++) {
        let fill = NEURON_COLOR;
        if (activation_intensities) {
            fill = get_intensity(activation_intensities[i]);
        }
        if (activations) {
            if (activations[i]) {
                fill = NEURON_COLOR_ACTIVE;
            }
        }
        b = neurons[i];
        x = left_x + (i * neuron_size) + ((i + 1) * padding) + (neuron_size / 2);
        create_circle(x, y, (neuron_size / 2) * b, canvas, color = fill);
        if (labels) {
            canvas.font = TITLE_FONT;
            canvas.textAlign = "center";
            canvas.fillText(labels[i], x, y - (5 * neuron_size));
        }
        coordinates.push([x, y])
    }
    return coordinates
}

// Rescale data so that it is in pixel-friendly magnitude
function render_rescale(data, magnitude = 2) {
    biggest = max(data)
    smallest = -1 * min(data)
    const rescale = Math.max(biggest, smallest)
    scale_inplace(data, magnitude / rescale)
    return data;
}

// Simple util for returning bool array of active neurons
function is_firing(array, threshold = 0.01) {
    const dims = get_dims(array);
    // Fill in dims
    if (dims == 0) return array >= threshold
    if (dims == 1) return array.map(x => x >= threshold)
    if (dims == 2) return array.map(row => row.map(x => x >= threshold))
    if (dims > 2) throw "Masking array > 2 dimensions not supported"
}

// Given weights and preceding layer firing booleans, returns array of booleans indicating weight activity
function is_weight_active(w, l1, array) {
    /*
    w: x*n 2d array of weights connecting x inputs to n neurons
    l1: length x 1d array of neuron activations
    array: output array. turns off all zero pixels.
    */
    for (let l1_index = 0; l1_index < l1.length; l1_index++) {
        if (!l1[l1_index]) {
            // If a neuron is active, set all the weights connected to it to active
            for (let i = 0; i < array[l1_index].length; i++) {
                array[l1_index][i] = 0;
            }
        }
    }
    return array;
}

// Fold a flattened index into rectangular indices that match the shape of the matrix
function fold_index(index, matrix) {
    const columns = matrix[0].length;
    const row = Math.floor(index / columns);
    const column = index % columns;
    return [row, column];
}

// Return bool array of "significant" weights given weight strength
// Threshold is the percent ratio of total weights to render at a given time
function is_significant(w, threshold = 0.2) {
    // Find indices of top threshold% weight values
    render_cap = Math.floor(w.length * w[0].length * threshold);

    // Partial sort out the top threshold% weight indices
    args = arg_heapsort(w, render_cap);
    significant = args.map(x => fold_index(x, w));

    // Set the top indices to "true"
    significant_w = zeros_like(w);
    for (let i = 0; i < significant.length; i++) {
        const [l1, l2] = significant[i];
        significant_w[l1][l2] = 1;
    }
    return significant_w;
}


function render_weights(canvas, l1_positions, l2_positions, w, render_filter = null) {
    // Set up filtering
    let t2 = timer("and")

    let should_render = null;
    t = timer("argwhere");
    if (render_filter) {
        should_render = argwhere(render_filter)
    } else {
        console.log("Warning: using poorly optimized unfiltered render_weights. If this is called often, write a faster one.")
        should_render = argwhere(ones_like(w));
    }

    t.stop();

    t = timer("rendering");
    for (let i = 0; i < should_render.length; i++) {
        const [l1, l2] = should_render[i];
        l2_pos = l2_positions[l2]
        l1_pos = l1_positions[l1]
        let weight = w[l1][l2]
        let fill = WEIGHT_COLOR
        weight = abs(weight)

        // Render activation if l1 activation values are supplied
        if (render_filter) {
            active = render_filter[l1, l2]
            if (active) fill = WEIGHT_COLOR_ACTIVE
        }
        canvas.lineWidth = weight;
        canvas.strokeStyle = fill;
        canvas.beginPath();
        canvas.moveTo(l1_pos[0], l1_pos[1]);
        canvas.lineTo(l2_pos[0], l2_pos[1]);
        canvas.stroke();
        canvas.lineWidth = 1;
    }
    t.stop();
}