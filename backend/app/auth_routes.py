"""Account-management routes backed by Supabase Auth's admin API.

Sign-up/sign-in/sign-out happen client-side via supabase-js against Supabase
directly — this router only covers what must run server-side: deleting a
user's account with the service_role key.
"""

import os

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client, create_client

from app.auth import get_current_user_id

router = APIRouter(prefix="/api/auth", tags=["auth"])

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
_admin_client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


@router.delete("/account")
async def delete_account(user_id: str = Depends(get_current_user_id)):
    try:
        _admin_client.auth.admin.delete_user(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {e}")
    return {"status": "deleted"}
