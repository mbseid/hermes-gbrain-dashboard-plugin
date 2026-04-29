"""Brain plugin — read-only access to /opt/data/home/brain markdown vault."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

# Vault root — overridable for testing
VAULT_ROOT = Path(os.environ.get("BRAIN_VAULT_PATH", "/opt/data/home/brain")).resolve()


def _safe_path(rel: str) -> Path:
    """Resolve rel against VAULT_ROOT; reject traversal."""
    if rel.startswith("/"):
        rel = rel.lstrip("/")
    target = (VAULT_ROOT / rel).resolve()
    if not target.is_relative_to(VAULT_ROOT):
        raise HTTPException(status_code=403, detail="Path traversal blocked")
    return target


def _walk_tree(root: Path) -> List[Dict[str, Any]]:
    """Build a nested file tree rooted at root, only .md files + their dirs."""
    entries: List[Dict[str, Any]] = []
    try:
        children = sorted(root.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except (PermissionError, FileNotFoundError):
        return entries
    for child in children:
        if child.name.startswith(".") or child.name == "node_modules":
            continue
        rel = child.relative_to(VAULT_ROOT).as_posix()
        if child.is_dir():
            kids = _walk_tree(child)
            if kids:  # only include dirs that contain .md somewhere
                entries.append({"type": "dir", "name": child.name, "path": rel, "children": kids})
        elif child.is_file() and child.suffix.lower() == ".md":
            try:
                size = child.stat().st_size
                mtime = child.stat().st_mtime
            except OSError:
                size, mtime = 0, 0
            entries.append({
                "type": "file",
                "name": child.name,
                "path": rel,
                "size": size,
                "mtime": mtime,
            })
    return entries


@router.get("/tree")
async def tree():
    """Return the full vault tree."""
    if not VAULT_ROOT.exists():
        raise HTTPException(status_code=404, detail=f"Vault not found at {VAULT_ROOT}")
    return {"root": str(VAULT_ROOT), "tree": _walk_tree(VAULT_ROOT)}


@router.get("/file")
async def get_file(path: str = Query(..., description="Relative path to .md file in vault")):
    """Return raw markdown contents of a file."""
    target = _safe_path(path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    if target.suffix.lower() != ".md":
        raise HTTPException(status_code=400, detail="Only .md files are supported")
    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not valid UTF-8")
    return {
        "path": path,
        "name": target.name,
        "content": content,
        "mtime": target.stat().st_mtime,
        "size": target.stat().st_size,
    }


@router.get("/resolve")
async def resolve_wikilink(name: str = Query(..., description="Wikilink target, e.g. 'Mike Seid'")):
    """Resolve a wikilink target to a file path. Searches by filename stem (case-insensitive)."""
    if not VAULT_ROOT.exists():
        raise HTTPException(status_code=404, detail="Vault not found")
    target_lower = name.lower().strip()
    # Strip any extension and pipe-alias
    if "|" in target_lower:
        target_lower = target_lower.split("|", 1)[0].strip()
    target_lower = target_lower.removesuffix(".md")

    matches: List[str] = []
    for md in VAULT_ROOT.rglob("*.md"):
        if md.stem.lower() == target_lower:
            matches.append(md.relative_to(VAULT_ROOT).as_posix())
        elif md.stem.lower().replace(" ", "-") == target_lower.replace(" ", "-"):
            matches.append(md.relative_to(VAULT_ROOT).as_posix())
    if not matches:
        raise HTTPException(status_code=404, detail=f"No file matching '{name}'")
    return {"name": name, "matches": matches}
