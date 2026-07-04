"""
Serveur d'inférence HenergyqueAI — Modal (GPU serverless)

Déploiement :
  1. pip install modal
  2. modal setup  (se connecter à son compte Modal)
  3. modal volume put qwen-model-vol ../HenergyqueAI/HenergyqueAI_GGUF_gguf/qwen2.5-coder-7b.Q4_K_M.gguf /model.gguf
  4. modal deploy serve_qwen.py

L'URL de l'endpoint s'affiche après le déploiement.
Copier cette URL dans la variable QWEN_API_URL de Vercel.
"""

import modal

MODEL_PATH = "/model/model.gguf"
VOLUME_NAME = "qwen-model-vol"

app = modal.App("henergyque-qwen")

vol = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "llama-cpp-python[server]==0.2.90",
        "fastapi>=0.110",
        "uvicorn[standard]",
        extra_options="--extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121",
    )
)


@app.function(
    image=image,
    gpu="A10G",
    volumes={"/model": vol},
    timeout=600,
    scaledown_window=300,
)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def serve():
    from llama_cpp.server.app import create_app
    from llama_cpp.server.settings import Settings

    settings = Settings(
        model=MODEL_PATH,
        n_gpu_layers=-1,
        n_ctx=4096,
        n_threads=8,
        chat_format="chatml",
        host="0.0.0.0",
        port=8000,
    )
    return create_app(settings=settings)


# ─── Commandes utiles ──────────────────────────────────────────────────────────
# Uploader le modèle :
#   modal volume put qwen-model-vol \
#     ../HenergyqueAI/HenergyqueAI_GGUF_gguf/qwen2.5-coder-7b.Q4_K_M.gguf \
#     /model.gguf
#
# Déployer :
#   modal deploy serve_qwen.py
#
# Tester en local (sans GPU) :
#   modal run serve_qwen.py
