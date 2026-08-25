"""FastAPI entrypoint. Run with: uvicorn app.main:app --reload --port 8000"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config, db
from app.generators import build_registry
from app.llm import GroqClient
from app.routes import router
from app.runner import Runner

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    prompts = config.load_prompts()
    client = GroqClient()
    app.state.prompts = prompts
    app.state.runner = Runner(build_registry(prompts, client), client.chat_model)

    (config.DATA_DIR / "uploads").mkdir(parents=True, exist_ok=True)
    (config.DATA_DIR / "artifacts").mkdir(parents=True, exist_ok=True)
    await db.init_pool()
    yield
    await db.close_pool()
    await client.close()


app = FastAPI(title="SIH Transform", lifespan=lifespan)

origins = [o.strip() for o in config.CORS_ORIGINS.split(",")] if config.CORS_ORIGINS != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
