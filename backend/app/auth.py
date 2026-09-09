"""Supabase auth verification for backend-protected routes.

This project's Supabase instance has migrated to the new JWT Signing Keys,
so the legacy shared secret no longer verifies user session tokens (only
Supabase's own anon/service_role API keys) — local HS256 verification
won't work. Instead, verify tokens via Supabase's own API, which works
regardless of signing key type at the cost of a network round trip per
request.
"""

import os
from typing import Optional

from fastapi import Header, HTTPException
from supabase import Client, create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

_verify_client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


async def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        response = _verify_client.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not response or not response.user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return response.user.id
