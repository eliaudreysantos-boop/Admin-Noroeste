#!/usr/bin/env python3
"""Build a complete, validated root import from a fresh Firebase export."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ADMIN_MASTER_ID = "m_3fa99d9d"
LEGACY_ADMIN_USER_ID = "u_mestre"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8-sig") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} nao possui objeto na raiz")
    return value


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def apply_update(root: dict[str, Any], path: str, value: Any) -> None:
    parts = path.split("/")
    if not parts or any(not part or any(char in part for char in ".#$[]") for part in parts):
        raise ValueError(f"caminho Firebase invalido: {path}")
    current = root
    for part in parts[:-1]:
        child = current.setdefault(part, {})
        if not isinstance(child, dict):
            raise ValueError(f"caminho atravessa valor nao objeto: {path}")
        current = child
    if value is None:
        raise ValueError(f"o mapa final nao aceita exclusao: {path}")
    current[parts[-1]] = value


def migrate_admin_user(root: dict[str, Any]) -> dict[str, Any]:
    master_people = root.get("master", {}).get("pessoas", {})
    if ADMIN_MASTER_ID not in master_people:
        raise ValueError(f"masterId do Admin nao existe: {ADMIN_MASTER_ID}")
    users = root.setdefault("usuarios", {})
    if not isinstance(users, dict):
        raise ValueError("usuarios nao e uma colecao")
    legacy = users.pop(LEGACY_ADMIN_USER_ID, None)
    current = users.get(ADMIN_MASTER_ID)
    if legacy is None and current is None:
        raise ValueError("conta Admin nao encontrada")
    if legacy is not None and current is not None and legacy != current:
        raise ValueError("existem duas contas Admin divergentes")
    admin = dict(current or legacy)
    apps = dict(admin.get("apps") or {})
    apps.update({"mestre": True, "individual": True, "servicoCampo": True})
    admin["apps"] = apps
    admin["ativo"] = True
    admin["masterId"] = ADMIN_MASTER_ID
    admin["nome"] = str(admin.get("nome") or master_people[ADMIN_MASTER_ID].get("name") or "Eliaudrey")
    users[ADMIN_MASTER_ID] = admin
    return admin


def validate_result(
    fresh: dict[str, Any], result: dict[str, Any], updates: dict[str, Any]
) -> dict[str, Any]:
    errors: list[str] = []
    for root_key in fresh:
        if root_key not in result:
            errors.append(f"raiz do backup fresco foi perdida: {root_key}")
    if "pendenciasMigracao" in result:
        errors.append("pendencias privadas nao devem entrar no arquivo de importacao")
    users = result.get("usuarios", {})
    if LEGACY_ADMIN_USER_ID in users:
        errors.append("usuario legado u_mestre ainda existe")
    admin = users.get(ADMIN_MASTER_ID, {}) if isinstance(users, dict) else {}
    if admin.get("masterId") != ADMIN_MASTER_ID or admin.get("ativo") is not True:
        errors.append("conta Admin nao foi vinculada ao masterId esperado")
    if admin.get("apps", {}).get("mestre") is not True:
        errors.append("conta Admin perdeu acesso ao modulo Admin")
    for path, expected in updates.items():
        if path == f"usuarios/{LEGACY_ADMIN_USER_ID}/masterId":
            if admin.get("masterId") != expected:
                errors.append("vinculo do usuario legado nao chegou a conta Admin final")
            continue
        current: Any = result
        for part in path.split("/"):
            current = current.get(part) if isinstance(current, dict) else None
        if current != expected:
            errors.append(f"atualizacao nao aplicada: {path}")
            if len(errors) >= 20:
                break
    if errors:
        raise ValueError("; ".join(errors))
    secretary = result.get("secretario", {})
    program = result.get("programacao", {})
    return {
        "rootKeysPreserved": len(fresh),
        "updatesApplied": len(updates),
        "users": len(users),
        "secretaryReports": len(secretary.get("relatorios", {})),
        "programs": len(program.get("programs", {})),
        "errors": 0,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fresh", type=Path, required=True)
    parser.add_argument("--updates", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    fresh_path = args.fresh.resolve()
    updates_path = args.updates.resolve()
    if not fresh_path.is_file() or not updates_path.is_file():
        raise FileNotFoundError("backup fresco ou mapa de atualizacoes nao encontrado")
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    output_dir = (
        args.output_dir.resolve()
        if args.output_dir
        else fresh_path.parent / f"firebase-importacao-raiz-{stamp}"
    )
    if output_dir.exists():
        raise FileExistsError(f"pasta de saida ja existe: {output_dir}")

    fresh = load_json(fresh_path)
    updates = load_json(updates_path)
    result = json.loads(json.dumps(fresh, ensure_ascii=False))
    for path, value in updates.items():
        apply_update(result, path, value)
    admin = migrate_admin_user(result)
    validation = validate_result(fresh, result, updates)

    output_dir.mkdir(parents=True)
    source_copy = output_dir / "BACKUP-FRESCO-ORIGINAL-NAO-IMPORTAR.json"
    shutil.copy2(fresh_path, source_copy)
    target = output_dir / "FIREBASE-IMPORTAR-NA-RAIZ.json"
    write_json(target, result)
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "freshSource": {
            "name": fresh_path.name,
            "sha256": sha256(fresh_path),
            "copySha256": sha256(source_copy),
        },
        "updatesSource": {
            "name": updates_path.name,
            "sha256": sha256(updates_path),
        },
        "finalImport": {
            "name": target.name,
            "sha256": sha256(target),
            "size": target.stat().st_size,
        },
        "admin": {
            "userKey": ADMIN_MASTER_ID,
            "masterId": admin["masterId"],
            "legacyUserRemoved": LEGACY_ADMIN_USER_ID,
        },
        "validation": validation,
    }
    write_json(output_dir / "MANIFESTO-IMPORTACAO.json", manifest)
    (output_dir / "LEIA-ANTES-DE-IMPORTAR.md").write_text(
        f"""# Importacao na raiz do Firebase

Arquivo a selecionar no Console:

`FIREBASE-IMPORTAR-NA-RAIZ.json`

Este arquivo foi montado sobre `{fresh_path.name}` e recebeu {len(updates)}
atualizacoes sem exclusao. A conta `usuarios/{LEGACY_ADMIN_USER_ID}` foi
substituida por `usuarios/{ADMIN_MASTER_ID}`, vinculada ao mesmo `masterId` e
com acesso ao Servico de Campo.

Antes de confirmar a importacao, confira no Console que o destino selecionado e
a raiz `/`. Nao selecione o arquivo `BACKUP-FRESCO-ORIGINAL-NAO-IMPORTAR.json`.

Depois da importacao, nao edite dados ate baixar um novo backup e executar a
auditoria pos-importacao.
""",
        encoding="utf-8",
    )
    print(output_dir)
    print(json.dumps(validation, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
