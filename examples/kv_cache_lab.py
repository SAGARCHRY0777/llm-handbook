"""
KV cache from scratch -- pure Python, no numpy, no torch.

Everything a real LLM does at inference time is here, just tiny:
token ids -> embeddings -> N transformer layers -> logits -> softmax -> next token.

The point of this file is to PROVE three things by running it:

  1. Attention weights and next-token probabilities are two *different* softmaxes.
  2. K and V for past tokens never change, so they can be cached.
  3. Caching changes NOTHING about the output -- only the amount of arithmetic.

Run:  python kv_cache_lab.py
"""

import math

# ---------------------------------------------------------------- toy config
VOCAB = 16          # 16 possible tokens
D_MODEL = 8         # hidden size
N_LAYERS = 2        # transformer blocks
N_HEADS = 2         # query heads
N_KV_HEADS = 1      # key/value heads  -> N_HEADS//N_KV_HEADS = 2  => this is GQA/MQA
HEAD_DIM = D_MODEL // N_HEADS   # 4

assert N_HEADS % N_KV_HEADS == 0
GROUP = N_HEADS // N_KV_HEADS   # how many Q heads share one KV head

# counter so we can literally show how much work the cache saves
OPS = {"dot": 0}


# ------------------------------------------------------------- tiny linalg
def dot(a, b):
    OPS["dot"] += 1
    return sum(x * y for x, y in zip(a, b))


def matvec(W, x):
    """W is a list of rows. Returns W @ x."""
    return [dot(row, x) for row in W]


def softmax(xs):
    m = max(xs)                       # subtract max for numerical stability
    exps = [math.exp(x - m) for x in xs]
    s = sum(exps)
    return [e / s for e in exps]


def rms_norm(x, eps=1e-6):
    ms = sum(v * v for v in x) / len(x)
    scale = 1.0 / math.sqrt(ms + eps)
    return [v * scale for v in x]


def add(a, b):
    return [x + y for x, y in zip(a, b)]


# --------------------------------------------------- deterministic "weights"
def lcg(seed):
    """Reproducible pseudo-random floats in [-0.5, 0.5) with zero dependencies."""
    state = seed

    def nxt():
        nonlocal state
        state = (1103515245 * state + 12345) % (2 ** 31)
        return state / (2 ** 31) - 0.5

    return nxt


rnd = lcg(7)


def make_matrix(rows, cols):
    return [[rnd() for _ in range(cols)] for _ in range(rows)]


# The embedding table: VOCAB rows, each a D_MODEL float vector.
# Token id 5 is NOT the number five -- it is "go to row 5 of this table".
EMBED = make_matrix(VOCAB, D_MODEL)

# Every layer gets its OWN projections. This is why the KV cache is per-layer.
LAYERS = []
for _ in range(N_LAYERS):
    LAYERS.append({
        "Wq": make_matrix(N_HEADS * HEAD_DIM, D_MODEL),
        "Wk": make_matrix(N_KV_HEADS * HEAD_DIM, D_MODEL),   # smaller than Wq -> GQA
        "Wv": make_matrix(N_KV_HEADS * HEAD_DIM, D_MODEL),
        "Wo": make_matrix(D_MODEL, N_HEADS * HEAD_DIM),
        "W1": make_matrix(4 * D_MODEL, D_MODEL),             # MLP up
        "W2": make_matrix(D_MODEL, 4 * D_MODEL),             # MLP down
    })

# Final projection from hidden state to one score per vocabulary token.
UNEMBED = make_matrix(VOCAB, D_MODEL)


def split_heads(flat, n_heads):
    return [flat[h * HEAD_DIM:(h + 1) * HEAD_DIM] for h in range(n_heads)]


# ------------------------------------------------------------------ a layer
def layer_forward(layer, x, k_cache, v_cache, collect=None):
    """
    Process ONE token through ONE transformer block.

    x        : hidden state for this token           (D_MODEL floats)
    k_cache  : list of past K, one entry per position, each [N_KV_HEADS][HEAD_DIM]
    v_cache  : same for V

    Mutates k_cache / v_cache by appending this token's K and V.
    Returns the new hidden state.
    """
    h = rms_norm(x)

    # --- the three projections. Same x, three different learned matrices.
    q = split_heads(matvec(layer["Wq"], h), N_HEADS)
    k = split_heads(matvec(layer["Wk"], h), N_KV_HEADS)
    v = split_heads(matvec(layer["Wv"], h), N_KV_HEADS)

    # --- THIS IS THE CACHE WRITE. K and V for this position are final forever.
    k_cache.append(k)
    v_cache.append(v)
    T = len(k_cache)                     # how many positions exist now

    out_heads = []
    for hd in range(N_HEADS):
        kv = hd // GROUP                 # which KV head this Q head reads

        # --- scores: this token's query vs EVERY key so far (incl. its own)
        scores = [dot(q[hd], k_cache[t][kv]) / math.sqrt(HEAD_DIM) for t in range(T)]

        # Causal masking is implicit: k_cache only ever contains the past and
        # the present. There is no future entry to mask out.
        w = softmax(scores)              # <-- SOFTMAX #1: attention weights

        if collect is not None and hd == 0:
            collect.append(w)

        # --- retrieve: weighted average of the value vectors
        o = [0.0] * HEAD_DIM
        for t in range(T):
            vt = v_cache[t][kv]
            for d in range(HEAD_DIM):
                o[d] += w[t] * vt[d]
        out_heads.append(o)

    concat = [val for head in out_heads for val in head]
    x = add(x, matvec(layer["Wo"], concat))          # residual

    # --- MLP
    h2 = rms_norm(x)
    up = matvec(layer["W1"], h2)
    act = [u * 0.5 * (1 + math.tanh(0.7978845608 * (u + 0.044715 * u ** 3))) for u in up]  # GELU
    x = add(x, matvec(layer["W2"], act))             # residual
    return x


def step(token_id, caches, collect=None):
    """One token through the whole stack. caches[i] = (k_cache, v_cache) for layer i."""
    x = EMBED[token_id][:]
    for i, layer in enumerate(LAYERS):
        k_cache, v_cache = caches[i]
        x = layer_forward(layer, x, k_cache, v_cache, collect if i == 0 else None)
    return matvec(UNEMBED, rms_norm(x))              # logits: one per vocab token


def new_caches():
    return [([], []) for _ in range(N_LAYERS)]


def greedy(logits):
    return max(range(len(logits)), key=lambda i: logits[i])


# --------------------------------------------------------------------- demos
def rule(title):
    print("\n" + "=" * 74)
    print(title)
    print("=" * 74)


def demo_two_softmaxes():
    rule("1. TWO DIFFERENT SOFTMAXES")
    prompt = [3, 9, 1, 12]
    caches = new_caches()
    attn = []
    logits = None
    for t in prompt:
        logits = step(t, caches, collect=attn)

    last_attn = attn[-1]
    print("\nSOFTMAX #1 -- attention weights, layer 0 head 0, for the LAST token.")
    print("   'how much of each PAST POSITION do I read?'  length = seq len =", len(last_attn))
    print("   " + "  ".join(f"pos{i}={w:.3f}" for i, w in enumerate(last_attn)))
    print(f"   sum = {sum(last_attn):.6f}")

    probs = softmax(logits)
    print("\nSOFTMAX #2 -- next-token probabilities, at the very end of the stack.")
    print("   'which VOCABULARY token comes next?'         length = vocab =", len(probs))
    top = sorted(range(VOCAB), key=lambda i: -probs[i])[:4]
    print("   " + "  ".join(f"tok{i}={probs[i]:.3f}" for i in top) + "  ...")
    print(f"   sum = {sum(probs):.6f}")
    print("\n   Different lengths, different meanings, different places in the network.")


def demo_dtypes_and_shapes():
    rule("2. WHAT IS ACTUALLY IN THE CACHE")
    caches = new_caches()
    for t in [3, 9, 1]:
        step(t, caches)

    k0, v0 = caches[0]
    print(f"\nlayers cached      : {len(caches)}   (each layer has its own K and V)")
    print(f"positions cached   : {len(k0)}")
    print(f"kv heads per pos   : {len(k0[0])}   (N_KV_HEADS={N_KV_HEADS}, N_HEADS={N_HEADS} -> GQA group={GROUP})")
    print(f"floats per kv head : {len(k0[0][0])}   (HEAD_DIM)")
    print(f"\nK[layer 0][pos 0][kv head 0] = {[round(x, 4) for x in k0[0][0]]}")
    print(f"V[layer 0][pos 0][kv head 0] = {[round(x, 4) for x in v0[0][0]]}")
    print(f"element type       : {type(k0[0][0][0]).__name__}   <- FLOATS, not ints")
    print("\nToken ids are ints (row indices). Everything after the embedding lookup is float.")


def demo_kv_is_frozen():
    rule("3. PAST K AND V NEVER CHANGE  (this is WHY caching is legal)")
    caches = new_caches()
    step(3, caches)
    snapshot = [x for x in caches[0][0][0][0]]
    print(f"\nafter 1 token   K[L0][pos0] = {[round(x, 4) for x in snapshot]}")
    for t in [9, 1, 12, 5]:
        step(t, caches)
    after = caches[0][0][0][0]
    print(f"after 5 tokens  K[L0][pos0] = {[round(x, 4) for x in after]}")
    print(f"identical       : {snapshot == after}")
    print("\nCausal attention means position 0 never sees positions 1..4,")
    print("so nothing downstream can reach back and alter its K or V.")
    print("A future token CAN change nothing about the past. That is the whole trick.")


def demo_cache_vs_no_cache():
    rule("4. CACHE vs NO CACHE -- same answer, far less arithmetic")
    prompt = [3, 9, 1, 12]
    n_new = 6

    # --- WITH cache: prefill once, then one token at a time.
    OPS["dot"] = 0
    caches = new_caches()
    logits = None
    for t in prompt:
        logits = step(t, caches)
    prefill_ops = OPS["dot"]
    cached_out, sizes = [], []
    for _ in range(n_new):
        nxt = greedy(logits)
        cached_out.append(nxt)
        logits = step(nxt, caches)
        sizes.append(len(caches[0][0]))
    cached_ops = OPS["dot"]

    # --- WITHOUT cache: re-run the entire sequence for every new token.
    OPS["dot"] = 0
    seq = prompt[:]
    fresh = new_caches()
    for t in seq:
        logits = step(t, fresh)
    naive_out = []
    for _ in range(n_new):
        nxt = greedy(logits)
        naive_out.append(nxt)
        seq.append(nxt)
        fresh = new_caches()                 # throw the cache away -- recompute all
        for t in seq:
            logits = step(t, fresh)
    naive_ops = OPS["dot"]

    print(f"\nprompt          : {prompt}")
    print(f"generated (cache)   : {cached_out}")
    print(f"generated (no cache): {naive_out}")
    print(f"IDENTICAL           : {cached_out == naive_out}")
    print(f"\ncache length after each decode step: {sizes}")
    print(f"\ndot products, prefill only     : {prefill_ops:>8,}")
    print(f"dot products, WITH cache       : {cached_ops:>8,}")
    print(f"dot products, WITHOUT cache    : {naive_ops:>8,}")
    print(f"speedup on this tiny run       : {naive_ops / cached_ops:.2f}x")
    print("\nWith only 10 tokens the gap is small. It grows quadratically:")
    print("no-cache total work is O(T^2) per generated token, cached is O(T).")


def demo_memory_math():
    rule("5. THE MEMORY FORMULA, ON REAL MODELS")
    print("\n  bytes_per_token = 2 (K and V) * n_layers * n_kv_heads * head_dim * dtype_bytes")
    models = [
        ("Llama 2 7B   (MHA)", 32, 32, 128, 2),
        ("Llama 3 8B   (GQA)", 32, 8, 128, 2),
        ("Llama 3 70B  (GQA)", 80, 8, 128, 2),
        ("Llama 3 8B   (GQA, fp8 KV)", 32, 8, 128, 1),
    ]
    print(f"\n  {'model':<28}{'KiB/token':>11}{'@8K ctx':>12}{'x64 users':>12}")
    print("  " + "-" * 63)
    for name, L, kvh, hd, b in models:
        per_tok = 2 * L * kvh * hd * b
        kib = per_tok / 1024
        gib8k = per_tok * 8192 / 1024 ** 3
        print(f"  {name:<28}{kib:>10.0f} {gib8k:>10.2f} GiB{gib8k * 64:>8.1f} GiB")
    print("\n  Llama 2 7B vs Llama 3 8B is the same head_dim and the same 32 layers.")
    print("  The 4x difference is entirely 32 KV heads -> 8 KV heads. That is GQA.")


def demo_paging():
    rule("6. PAGED KV CACHE -- fixed blocks + a block table")
    BLOCK = 4
    pool = list(range(10))                    # 10 free physical blocks
    requests = {"A": 9, "B": 3, "C": 6}       # request -> tokens held
    tables = {}
    for name, ntok in requests.items():
        need = math.ceil(ntok / BLOCK)
        tables[name] = [pool.pop(0) for _ in range(need)]

    print(f"\nblock size = {BLOCK} tokens (vLLM's default is 16)\n")
    for name, ntok in requests.items():
        blocks = tables[name]
        used = ntok
        cap = len(blocks) * BLOCK
        print(f"  request {name}: {ntok:>2} tokens -> logical blocks 0..{len(blocks)-1}"
              f" -> physical {blocks}")
        print(f"             capacity {cap}, used {used}, internal waste {cap - used} slots")
    print(f"\n  free blocks left: {pool}")
    print("\n  Physical blocks are NOT contiguous and do not have to be.")
    print("  A block table maps logical position -> physical block, exactly like")
    print("  an OS page table. External fragmentation goes to zero; the only waste")
    print("  is the partial last block of each request (< 1 block, always).")


def demo_prefix_sharing():
    rule("7. PREFIX CACHING -- the shared system prompt is computed once")
    system = [3, 9, 1, 12, 5]
    users = {"user A": [7, 2], "user B": [11, 4], "user C": [0, 14]}

    OPS["dot"] = 0
    shared = new_caches()
    for t in system:
        step(t, shared)
    shared_cost = OPS["dot"]

    OPS["dot"] = 0
    for _ in users:
        c = new_caches()
        for t in system:
            step(t, c)
    repeated_cost = OPS["dot"]

    print(f"\nshared system prompt : {system}  ({len(system)} tokens)")
    print(f"three user suffixes  : {list(users.values())}")
    print(f"\nprefix computed once for all 3 : {shared_cost:>9,} dot products")
    print(f"prefix recomputed per request  : {repeated_cost:>9,} dot products")
    print(f"wasted without prefix caching  : {repeated_cost - shared_cost:>9,}")
    print("\n  Real engines hash each block of token ids. Identical hash chain =")
    print("  identical KV = reuse the same physical block, refcounted. Copy-on-write")
    print("  at the first token that differs.")


if __name__ == "__main__":
    print(f"toy model: {N_LAYERS} layers, {N_HEADS} Q heads, {N_KV_HEADS} KV heads, "
          f"head_dim {HEAD_DIM}, vocab {VOCAB}")
    demo_two_softmaxes()
    demo_dtypes_and_shapes()
    demo_kv_is_frozen()
    demo_cache_vs_no_cache()
    demo_memory_math()
    demo_paging()
    demo_prefix_sharing()
    print("\n" + "=" * 74)
    print("Read layer_forward() again. The three lines that matter are the ones")
    print("that append k and v, and the loop that reads k_cache[t] back.")
    print("=" * 74 + "\n")
