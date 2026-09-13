#!/usr/bin/env python3
"""Prepare a reversible Firebase migration package from audited local sources.

The script never writes to Firebase and never edits a source file. It creates a
new directory containing immutable source copies, a proposed import JSON,
private migration pendings, a source manifest, and a human-readable report.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import shutil
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable


SOURCE_NAMES = (
    "oradoress2-default-rtdb-export.json",
    "tpl-novo-2-default-rtdb-export.json",
    "oradores-tarefas-default-rtdb-export.json",
    "dataMeeting.bks",
    "ServiceSecretary.bss",
)

EXPECTED_HASHES = {
    "oradoress2-default-rtdb-export.json": "f5d274754c290b387ffac759401cbcc538ba5675febdb61b7af740c8c0608571",
    "tpl-novo-2-default-rtdb-export.json": "302d1f4ad310f3957c1483d74ef8edc426d57b00c54eae0c94f1c9ee258fb5ef",
    "oradores-tarefas-default-rtdb-export.json": "1a613ac9bea982f40054f67f96d550c61d94bf6ead5cb194bef918ce95e4029e",
    "dataMeeting.bks": "f066b012065b0cd5b64d1a97f177b96d26593735398f07f446fc64cab81caaf4",
    "ServiceSecretary.bss": "ef766f3ca9e6292533949e72e02a8bbdc61b1a5cbe68358d2895c23c5612da52",
}

# These equivalences were checked against names, phones, roles, and the source
# comparison. Keys remain stable in modules that use local participant IDs.
TASK_PERSON_LINKS = {
    "p_6d59b9fd0533f": "m_abecd2f2",  # Wendson
    "p_bd1c92f3b58eb_19c719170dd": "m_1d6d07f9",  # Gabriel Augusto
    "p_e63cc3a50ddf4_19c7189e382": "m_823c4d45",  # Eduardo Lima
}
SPEAKER_LINKS = {
    "disc_orador_3": "m_abecd2f2",
    "disc_orador_12": "m_823c4d45",
    "disc_orador_28": "m_1d6d07f9",
}
SCALE_MASTER_LINKS = {
    "m_3a7fa8a9": "m_88c51563",  # Orlando
    "m_cfa785af": "m_41d6536a",  # Elbetty
    "m_99d59ad5": "m_cc5a5cf0",  # Janderson
    "m_f68f636b": "m_9ec3efa4",  # Luciano
}
USER_LINKS = {"u_mestre": "m_3fa99d9d"}
SECRETARY_PUBLISHER_OVERRIDES = {
    71: "m_0eb2ae36",  # Massicleide/Massecleide, unique phone
    157: "m_41d6536a",  # Elbetty, name, sex, role, and TPL identity
}

ASSIGNMENT_TITLES = {
    5: "Designacao do ministerio",
    10: "Leitura da Biblia",
    20: "Iniciando conversas",
    30: "Cultivando o interesse",
    60: "Fazendo discipulos",
    65: "Explicando crencas",
    66: "O que voce diria?",
    70: "Discurso",
}


def objects(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def text(value: Any) -> str:
    return str(value or "").strip()


def normalized_name(value: Any) -> str:
    plain = unicodedata.normalize("NFKD", text(value))
    plain = plain.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", " ", plain).strip()


def normalized_phone(value: Any) -> str:
    digits = re.sub(r"\D", "", text(value))
    if digits.startswith("55") and len(digits) >= 12:
        digits = digits[2:]
    return digits[-9:] if len(digits) >= 9 else digits


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


def open_sqlite_read_only(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def full_name(row: sqlite3.Row, fields: Iterable[str]) -> str:
    return " ".join(text(row[field]) for field in fields if text(row[field]))


def iso_month(year: Any, zero_based_month: Any) -> str:
    return f"{int(year):04d}-{int(zero_based_month) + 1:02d}"


def iso_date(year: Any, zero_based_month: Any, day: Any) -> str:
    numeric_year = int(year)
    if numeric_year < 2000 or numeric_year > 2100:
        raise ValueError(f"ano fora da faixa aceita: {numeric_year}")
    value = date(numeric_year, int(zero_based_month) + 1, int(day))
    return value.isoformat()


def next_month(value: str) -> str:
    year, month = map(int, value.split("-"))
    return f"{year + (1 if month == 12 else 0):04d}-{1 if month == 12 else month + 1:02d}"


def deterministic_stamp(competence: str) -> str:
    return f"{next_month(competence)}-01T12:00:00.000Z"


def person_indexes(master_people: dict[str, Any]) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    by_name: dict[str, list[str]] = defaultdict(list)
    by_phone: dict[str, list[str]] = defaultdict(list)
    for master_id, raw in master_people.items():
        person = objects(raw)
        name_key = normalized_name(person.get("name"))
        phone_key = normalized_phone(person.get("whatsapp"))
        if name_key:
            by_name[name_key].append(master_id)
        if phone_key:
            by_phone[phone_key].append(master_id)
    return dict(by_name), dict(by_phone)


def prepare_current_links(proposed: dict[str, Any], master_people: dict[str, Any]) -> dict[str, int]:
    counts = Counter()
    task_people = objects(objects(proposed.get("tarefas")).get("people"))
    speakers = objects(objects(objects(proposed.get("tarefas")).get("discursos")).get("oradores"))
    scale_people = objects(objects(proposed.get("escala")).get("participants"))
    users = objects(proposed.get("usuarios"))

    for local_id, master_id in TASK_PERSON_LINKS.items():
        if local_id in task_people and master_id in master_people:
            task_people[local_id]["masterId"] = master_id
            counts["tarefas"] += 1
    for speaker_id, master_id in SPEAKER_LINKS.items():
        if speaker_id in speakers and master_id in master_people:
            speakers[speaker_id]["masterId"] = master_id
            counts["oradores"] += 1
    for local_id, master_id in SCALE_MASTER_LINKS.items():
        if local_id in scale_people and master_id in master_people:
            scale_people[local_id]["masterId"] = master_id
            counts["escala"] += 1
    for user_id, master_id in USER_LINKS.items():
        if user_id in users and master_id in master_people:
            users[user_id]["masterId"] = master_id
            counts["usuarios"] += 1
    return dict(counts)


def secretary_publisher_mapping(
    connection: sqlite3.Connection,
    master_people: dict[str, Any],
) -> tuple[dict[int, str], list[dict[str, Any]]]:
    by_name, _ = person_indexes(master_people)
    mapping: dict[int, str] = {}
    unresolved: list[dict[str, Any]] = []
    for row in connection.execute("SELECT * FROM publishers ORDER BY _id"):
        legacy_id = int(row["_id"])
        name = full_name(row, ("FirstName", "MiddleName", "LastName"))
        exact = by_name.get(normalized_name(name), [])
        master_id = exact[0] if len(exact) == 1 else SECRETARY_PUBLISHER_OVERRIDES.get(legacy_id, "")
        if master_id in master_people:
            mapping[legacy_id] = master_id
        else:
            count = connection.execute(
                "SELECT COUNT(*) FROM reports WHERE idPublisher = ?", (legacy_id,)
            ).fetchone()[0]
            unresolved.append(
                {
                    "legacyPublisherId": legacy_id,
                    "nomeLegado": name,
                    "ativoNoLegado": not bool(row["Disabled"]),
                    "quantidadeRelatorios": int(count),
                    "motivo": "nenhuma equivalencia unica e segura no cadastro central",
                }
            )
    return mapping, unresolved


def publisher_category(value: Any) -> str:
    return {1: "pioneiro_auxiliar", 2: "pioneiro_regular"}.get(int(value or 0), "publicador")


def report_category(value: Any) -> str:
    return {1: "pioneiro_auxiliar", 2: "pioneiro_regular"}.get(int(value or 0), "publicador")


def prepare_secretary(
    proposed: dict[str, Any],
    connection: sqlite3.Connection,
    master_people: dict[str, Any],
    pending: dict[str, Any],
) -> dict[str, int]:
    mapping, unresolved = secretary_publisher_mapping(connection, master_people)
    groups: dict[str, Any] = {}
    for row in connection.execute("SELECT * FROM publishers_groups ORDER BY _id"):
        group_id = f"sec_group_{int(row['_id'])}"
        groups[group_id] = {
            "id": group_id,
            "nome": text(row["Name"]),
            "superintendenteMasterId": "",
            "ativo": True,
        }

    publishers: dict[str, Any] = {}
    publisher_rows_by_master: dict[str, list[sqlite3.Row]] = defaultdict(list)
    for row in connection.execute("SELECT * FROM publishers ORDER BY _id"):
        legacy_id = int(row["_id"])
        master_id = mapping.get(legacy_id)
        if not master_id:
            continue
        publisher_rows_by_master[master_id].append(row)

    merged_publishers: list[dict[str, Any]] = []
    for master_id, source_rows in publisher_rows_by_master.items():
        # The largest legacy ID is the most recently recreated local record.
        row = max(source_rows, key=lambda item: int(item["_id"]))
        legacy_id = int(row["_id"])
        publisher_id = f"sec_pub_{legacy_id}"
        publishers[publisher_id] = {
            "id": publisher_id,
            "masterId": master_id,
            "categoria": publisher_category(row["Pioneer"]),
            "grupoId": f"sec_group_{int(row['idGroup'])}" if row["idGroup"] is not None else "",
            "ativo": not bool(row["Disabled"]) and not bool(row["disfellowshipped"]),
            "surdo": bool(row["Deaf"]),
            "cego": bool(row["Blind"]),
            "preso": bool(row["Incarcerated"]),
        }
        if len(source_rows) > 1:
            merged_publishers.append(
                {
                    "masterId": master_id,
                    "publisherIdOficial": publisher_id,
                    "legacyPublisherIds": sorted(int(item["_id"]) for item in source_rows),
                    "motivo": "cadastros legados duplicados convergem para a mesma pessoa",
                }
            )

    locked_months = {
        iso_month(row["Year"], row["Month"])
        for row in connection.execute("SELECT * FROM months_locked")
    }
    reports: dict[str, Any] = {}
    report_source_ids: dict[str, int] = {}
    report_legacy_fields: dict[str, Any] = {}
    skipped_reports: list[dict[str, Any]] = []
    merged_reports: list[dict[str, Any]] = []
    conflicting_reports: list[dict[str, Any]] = []
    for row in connection.execute("SELECT * FROM reports ORDER BY _id"):
        legacy_id = int(row["_id"])
        legacy_publisher_id = int(row["idPublisher"])
        competence = iso_month(row["Year"], row["Month"])
        master_id = mapping.get(legacy_publisher_id)
        if not master_id:
            skipped_reports.append(
                {
                    "legacyReportId": legacy_id,
                    "legacyPublisherId": legacy_publisher_id,
                    "competencia": competence,
                    "motivo": "publicador legado ainda sem vinculo",
                }
            )
            continue
        report_id = f"{master_id}__{competence}"
        pioneer_code = int(row["PioneerReport"] or 0)
        field_hours = max(0, int(row["Hours"] or 0)) + max(0, int(row["Minutes"] or 0)) / 60
        approved_hours = max(0, int(row["HoursLDC"] or 0)) + max(0, int(row["TSHours"] or 0))
        stamp = deterministic_stamp(competence)
        candidate = {
            "id": report_id,
            "masterId": master_id,
            "competencia": competence,
            "categoria": report_category(pioneer_code),
            "participou": pioneer_code != -1,
            "estudos": max(0, int(row["BibleStudies"] or 0)),
            "horasCampo": round(field_hours, 2) if pioneer_code in (1, 2) else 0,
            "horasAtividadeAprovada": approved_hours,
            "creditoHoras": 0,
            "pioneiroAuxiliar": pioneer_code == 1,
            "observacoes": "",
            "atrasado": False,
            "recebidoEm": stamp[:10],
            "atualizadoEm": stamp,
            "origem": "secretario",
            "createdBy": "secretario",
            "lastEditedBy": "secretario",
            "status": "fechado" if competence in locked_months else "revisado",
            "revision": 1,
        }
        if report_id in reports:
            if reports[report_id] == candidate:
                merged_reports.append(
                    {
                        "reportId": report_id,
                        "legacyReportIds": [report_source_ids[report_id], legacy_id],
                        "motivo": "registros mensais identicos de cadastros legados duplicados",
                    }
                )
            else:
                conflicting_reports.append(
                    {
                        "reportId": report_id,
                        "legacyReportIds": [report_source_ids[report_id], legacy_id],
                        "motivo": "valores diferentes para a mesma pessoa e competencia; revisao manual obrigatoria",
                    }
                )
                reports.pop(report_id, None)
                report_source_ids.pop(report_id, None)
            continue
        reports[report_id] = candidate
        report_source_ids[report_id] = legacy_id
        report_legacy_fields[str(legacy_id)] = {
            "reportIdConvertido": report_id,
            "legacyPublisherId": legacy_publisher_id,
            "PioneerReport": pioneer_code,
            "Hours": int(row["Hours"] or 0),
            "Minutes": int(row["Minutes"] or 0),
            "HoursLDC": int(row["HoursLDC"] or 0),
            "TSHours": int(row["TSHours"] or 0),
            "BibleStudies": int(row["BibleStudies"] or 0),
            "BibleStudies2": int(row["BibleStudies2"] or 0),
            "ConstructionServant": int(row["ConstructionServant"] or 0),
        }

    attendance: dict[str, Any] = {}
    invalid_attendance: list[dict[str, Any]] = []
    for row in connection.execute("SELECT * FROM attendance ORDER BY _id"):
        legacy_id = int(row["_id"])
        try:
            meeting_date = iso_date(row["Year"], row["Month"], row["Day"])
        except (TypeError, ValueError):
            invalid_attendance.append(
                {
                    "legacyAttendanceId": legacy_id,
                    "dia": row["Day"],
                    "mesBaseZero": row["Month"],
                    "ano": row["Year"],
                    "motivo": "data invalida no arquivo legado",
                }
            )
            continue
        attendance_id = f"sec_att_{legacy_id}"
        attendance[attendance_id] = {
            "id": attendance_id,
            "data": meeting_date,
            "tipo": "meio_semana" if int(row["Meeting"] or 0) == 0 else "fim_semana",
            "quantidade": max(0, int(row["Attendance"] or 0)),
            "atualizadoEm": f"{meeting_date}T12:00:00.000Z",
        }

    closings = {
        competence: {
            "enviadoEm": deterministic_stamp(competence),
            "fechadoEm": deterministic_stamp(competence),
            "origemMigracao": "ServiceSecretary.bss",
        }
        for competence in sorted(locked_months)
    }
    proposed["secretario"] = {
        "grupos": groups,
        "publicadores": publishers,
        "relatorios": reports,
        "assistencia": attendance,
        "fechamentos": closings,
        "meta": {
            "schemaVersion": 1,
            "migrationSource": "ServiceSecretary.bss",
            "migrationPreparedAt": datetime.now(timezone.utc).isoformat(),
        },
    }
    pending["secretario"] = {
        "publicadoresSemVinculo": unresolved,
        "publicadoresDuplicadosMesclados": merged_publishers,
        "relatoriosNaoImportados": skipped_reports,
        "relatoriosDuplicadosMesclados": merged_reports,
        "relatoriosConflitantesNaoImportados": conflicting_reports,
        "assistenciaInvalida": invalid_attendance,
        "gruposSemSuperintendente": sorted(groups),
        "camposNumericosLegados": report_legacy_fields,
        "ajustesMensaisLegados": [dict(row) for row in connection.execute("SELECT * FROM adjustments ORDER BY Year, Month")],
        "exclusoesIntencionais": [
            "enderecos, contatos de emergencia, nascimento e batismo nao foram copiados para o no publico",
            "notas livres dos relatorios permanecem somente na copia imutavel da fonte",
            "desassociacao e outros dados pastorais permanecem somente na copia imutavel da fonte",
        ],
    }
    return {
        "mapeamentos": len(mapping),
        "publicadores": len(publishers),
        "relatorios": len(reports),
        "assistencia": len(attendance),
        "fechamentos": len(closings),
        "publicadoresPendentes": len(unresolved),
        "relatoriosPendentes": len(skipped_reports),
        "assistenciaPendente": len(invalid_attendance),
        "publicadoresDuplicadosMesclados": len(merged_publishers),
        "relatoriosDuplicadosMesclados": len(merged_reports),
        "relatoriosConflitantes": len(conflicting_reports),
    }


def student_master_mapping(
    meeting: sqlite3.Connection,
    secretary: sqlite3.Connection,
    secretary_mapping: dict[int, str],
    master_people: dict[str, Any],
) -> tuple[dict[int, str], dict[int, str], list[dict[str, Any]]]:
    by_name, by_phone = person_indexes(master_people)
    secretary_candidates: list[tuple[str, int, str]] = []
    for row in secretary.execute("SELECT * FROM publishers ORDER BY _id"):
        legacy_id = int(row["_id"])
        master_id = secretary_mapping.get(legacy_id)
        if master_id:
            secretary_candidates.append(
                (
                    normalized_name(full_name(row, ("FirstName", "MiddleName", "LastName"))),
                    legacy_id,
                    master_id,
                )
            )

    mapping: dict[int, str] = {}
    reasons: dict[int, str] = {}
    unresolved: list[dict[str, Any]] = []
    for row in meeting.execute("SELECT * FROM students WHERE _id > 0 ORDER BY _id"):
        legacy_id = int(row["_id"])
        name = full_name(row, ("FirstName", "LastName"))
        name_key = normalized_name(name)
        exact = by_name.get(name_key, [])
        if len(exact) == 1:
            mapping[legacy_id] = exact[0]
            reasons[legacy_id] = "nome completo exato"
            continue
        phone_key = normalized_phone(row["PhoneMobile"])
        phone_hits = by_phone.get(phone_key, []) if phone_key else []
        if len(phone_hits) == 1:
            candidate_name = normalized_name(objects(master_people[phone_hits[0]]).get("name"))
            source_first = name_key.split()[:1]
            if source_first and source_first[0] in candidate_name.split():
                mapping[legacy_id] = phone_hits[0]
                reasons[legacy_id] = "telefone unico e primeiro nome compativel"
                continue
        source_tokens = name_key.split()
        contained = [
            (legacy_publisher_id, master_id)
            for candidate, legacy_publisher_id, master_id in secretary_candidates
            if source_tokens and all(token in candidate.split() for token in source_tokens)
        ]
        unique_master_ids = sorted({master_id for _, master_id in contained})
        if len(unique_master_ids) == 1:
            mapping[legacy_id] = unique_master_ids[0]
            reasons[legacy_id] = "nome abreviado contido em um unico publicador do Secretario"
            continue
        unresolved.append(
            {
                "legacyStudentId": legacy_id,
                "nomeLegado": name,
                "motivo": "nenhuma equivalencia unica e segura no cadastro central",
            }
        )
    return mapping, reasons, unresolved


def update_program_profiles(
    proposed: dict[str, Any],
    meeting: sqlite3.Connection,
    student_to_master: dict[int, str],
    master_people: dict[str, Any],
) -> tuple[dict[int, str], list[dict[str, Any]], int]:
    program = objects(proposed.setdefault("programacao", {}))
    profiles = objects(program.setdefault("pessoas", {}))
    by_debug: dict[str, list[str]] = defaultdict(list)
    for profile_id, raw in profiles.items():
        debug_name = normalized_name(objects(raw).get("_nome_debug"))
        if debug_name:
            by_debug[debug_name].append(profile_id)

    students = {
        int(row["_id"]): row
        for row in meeting.execute("SELECT * FROM students WHERE _id > 0 ORDER BY _id")
    }
    repaired = 0
    for student_id, master_id in student_to_master.items():
        row = students[student_id]
        profile_hits = by_debug.get(normalized_name(full_name(row, ("FirstName", "LastName"))), [])
        if len(profile_hits) != 1:
            continue
        profile = objects(profiles[profile_hits[0]])
        if profile.get("masterId") not in master_people and master_id in master_people:
            profile["masterId"] = master_id
            repaired += 1

    student_to_profile: dict[int, str] = {}
    unresolved_assignments: list[dict[str, Any]] = []
    for student_id, row in students.items():
        profile_hits = by_debug.get(normalized_name(full_name(row, ("FirstName", "LastName"))), [])
        if len(profile_hits) == 1:
            profile_id = profile_hits[0]
            if objects(profiles[profile_id]).get("masterId") in master_people:
                student_to_profile[student_id] = profile_id
                continue
        unresolved_assignments.append(
            {
                "legacyStudentId": student_id,
                "nomeLegado": full_name(row, ("FirstName", "LastName")),
                "motivo": "perfil atual ausente, ambiguo ou ainda sem masterId valido",
            }
        )
    return student_to_profile, unresolved_assignments, repaired


def joined_reference(*values: Any) -> str:
    unique: list[str] = []
    for value in values:
        item = text(value)
        if item and item not in unique:
            unique.append(item)
    return " | ".join(unique)


def legacy_part(
    part_id: str,
    section: str,
    title: str,
    minutes: Any,
    meeting_date: str,
    assigned_profile: str = "",
    assistant_profile: str = "",
    reference: str = "",
    absent: bool = False,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "id": part_id,
        "section": section,
        "title": title,
        "durationMinutes": max(1, int(minutes or 1)),
        "roomId": "main",
        "status": "realizado" if meeting_date < date.today().isoformat() and assigned_profile and not absent else "programado",
    }
    if assigned_profile:
        result["assignedPersonId"] = assigned_profile
        if result["status"] == "realizado":
            result["realizedPersonId"] = assigned_profile
    if assistant_profile:
        result["assistantPersonId"] = assistant_profile
    if reference:
        result["reference"] = reference
    if absent:
        result["absent"] = True
    return result


def prepare_program_history(
    proposed: dict[str, Any],
    meeting: sqlite3.Connection,
    secretary: sqlite3.Connection,
    master_people: dict[str, Any],
    pending: dict[str, Any],
) -> dict[str, int]:
    secretary_mapping, _ = secretary_publisher_mapping(secretary, master_people)
    student_to_master, mapping_reasons, unresolved_students = student_master_mapping(
        meeting, secretary, secretary_mapping, master_people
    )
    student_to_profile, unresolved_profiles, repaired = update_program_profiles(
        proposed, meeting, student_to_master, master_people
    )
    students = {
        int(row["_id"]): full_name(row, ("FirstName", "LastName"))
        for row in meeting.execute("SELECT * FROM students WHERE _id > 0")
    }

    assignments_by_date: dict[str, list[sqlite3.Row]] = defaultdict(list)
    for row in meeting.execute("SELECT * FROM assignments ORDER BY Year, Month, Day, Number, _id"):
        try:
            assignment_date = iso_date(row["Year"], row["Month"], row["Day"])
        except (TypeError, ValueError):
            continue
        assignments_by_date[assignment_date].append(row)

    programs = objects(objects(proposed.setdefault("programacao", {})).setdefault("programs", {}))
    imported = 0
    unresolved_designations: list[dict[str, Any]] = []
    skipped_future = 0
    cutoff = date.today().isoformat()

    for row in meeting.execute("SELECT * FROM midweek_assignments ORDER BY Year, Month, Day, _id"):
        meeting_date = iso_date(row["Year"], row["Month"], row["Day"])
        if meeting_date > cutoff:
            skipped_future += 1
            continue
        program_id = meeting_date
        if program_id in programs:
            unresolved_designations.append(
                {"data": meeting_date, "motivo": "programa atual ja existe; legado nao sobrescrito"}
            )
            continue
        parts: list[dict[str, Any]] = []

        def add_role(field: str, suffix: str, section: str, title: str, minutes: int) -> None:
            student_id = int(row[field]) if row[field] is not None else 0
            if not student_id:
                return
            profile_id = student_to_profile.get(student_id, "")
            if not profile_id:
                unresolved_designations.append(
                    {
                        "data": meeting_date,
                        "campo": field,
                        "legacyStudentId": student_id,
                        "nomeLegado": students.get(student_id, ""),
                        "motivo": "designado sem perfil atual vinculado com seguranca",
                    }
                )
            parts.append(
                legacy_part(
                    f"legacy-{int(row['_id'])}-{suffix}", section, title, minutes,
                    meeting_date, profile_id,
                )
            )

        add_role("idChairmanLAMM", "presidente", "tesouros", "Presidente", 1)
        add_role("idPrayerO", "oracao-inicial", "tesouros", "Oracao inicial", 1)
        add_role("idTreasures", "tesouros", "tesouros", text(row["titleTreasures"]) or "Tesouros da Palavra de Deus", 10)
        add_role("idGems", "joias", "tesouros", "Joias espirituais", 10)

        for assignment in assignments_by_date.get(meeting_date, []):
            code = int(assignment["Assignment"] or 0)
            if code not in ASSIGNMENT_TITLES:
                continue
            student_id = int(assignment["idStudent"] or 0)
            assistant_id = int(assignment["idAssistant"] or 0)
            if not student_id and not assistant_id:
                continue
            profile_id = student_to_profile.get(student_id, "") if student_id else ""
            assistant_profile = student_to_profile.get(assistant_id, "") if assistant_id else ""
            if student_id and not profile_id:
                unresolved_designations.append(
                    {
                        "data": meeting_date,
                        "legacyAssignmentId": int(assignment["_id"]),
                        "legacyStudentId": student_id,
                        "nomeLegado": students.get(student_id, ""),
                        "motivo": "designado principal sem perfil atual vinculado com seguranca",
                    }
                )
            if assistant_id and not assistant_profile:
                unresolved_designations.append(
                    {
                        "data": meeting_date,
                        "legacyAssignmentId": int(assignment["_id"]),
                        "legacyStudentId": assistant_id,
                        "nomeLegado": students.get(assistant_id, ""),
                        "motivo": "ajudante sem perfil atual vinculado com seguranca",
                    }
                )
            parts.append(
                legacy_part(
                    f"legacy-assignment-{int(assignment['_id'])}",
                    "ministerio",
                    ASSIGNMENT_TITLES[code],
                    assignment["Time"],
                    meeting_date,
                    profile_id,
                    assistant_profile,
                    joined_reference(assignment["StudyPointTxt"], assignment["OtherTxt"], assignment["Notes"]),
                    bool(assignment["Absent"]),
                )
            )

        for index in (1, 2, 3):
            field = f"idLiving{index}"
            title_field = f"titleLiving{index}"
            time_field = f"living{index}Time"
            if row[field] is not None:
                add_role(field, f"vida-{index}", "vida-crista", text(row[title_field]) or "Nossa Vida Crista", int(row[time_field] or 15))
        add_role("idCongregationBS", "estudo", "vida-crista", "Estudo Biblico de Congregacao", 30)
        add_role("idReaderBS", "leitor", "vida-crista", "Leitor do Estudo Biblico de Congregacao", 30)
        add_role("idPrayerC", "oracao-final", "vida-crista", "Oracao final", 1)

        programs[program_id] = {
            "id": program_id,
            "meetingDate": meeting_date,
            "bibleReading": text(row["titleBibleReading"]),
            "notes": text(row["Notes"]),
            "type": "normal",
            "parts": parts,
            "importedAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        imported += 1

    pending["programacao"] = {
        "alunosSemMasterId": unresolved_students,
        "perfisSemVinculoSeguro": unresolved_profiles,
        "designacoesSemVinculoSeguro": unresolved_designations,
        "semanasFuturasNaoImportadas": skipped_future,
        "criteriosDeMapeamento": {
            str(student_id): {"masterId": student_to_master[student_id], "motivo": reason}
            for student_id, reason in sorted(mapping_reasons.items())
        },
        "semanasEspeciaisLegadas": [dict(row) for row in meeting.execute("SELECT * FROM specialweeks ORDER BY Year, Month, Day")],
        "discursosPublicosLegados": {
            "quantidade": meeting.execute("SELECT COUNT(*) FROM publictalks_assignments").fetchone()[0],
            "motivo": "nao mesclados automaticamente porque Oradores atual ja possui historico mais completo",
        },
    }
    return {
        "alunosMapeados": len(student_to_master),
        "perfisReparados": repaired,
        "programasHistoricos": imported,
        "semanasFuturasPendentes": skipped_future,
        "designacoesPendentes": len(unresolved_designations),
    }


def complementary_speaker_pendings(
    main: dict[str, Any], complementary: dict[str, Any]
) -> list[dict[str, Any]]:
    main_program = objects(objects(objects(main.get("tarefas")).get("discursos")).get("programacao"))
    old_root = objects(complementary.get("tarefas")) or complementary
    old_program = objects(objects(old_root.get("discursos")).get("programacao"))
    return [
        {"id": record_id, "registro": record, "motivo": "existe apenas na fonte complementar; requer revisao manual"}
        for record_id, record in old_program.items()
        if record_id not in main_program
    ]


def remaining_link_counts(proposed: dict[str, Any], master_people: dict[str, Any]) -> dict[str, int]:
    result: dict[str, int] = {}
    collections = {
        "tarefas": objects(objects(proposed.get("tarefas")).get("people")),
        "escala": objects(objects(proposed.get("escala")).get("participants")),
        "programacao": objects(objects(proposed.get("programacao")).get("pessoas")),
        "usuarios": objects(proposed.get("usuarios")),
    }
    for name, records in collections.items():
        result[name] = sum(1 for record in records.values() if objects(record).get("masterId") not in master_people)
    return result


def build_update_map(main: dict[str, Any], proposed: dict[str, Any]) -> dict[str, Any]:
    """Build additive multi-location updates without replacing whole old modules."""
    updates: dict[str, Any] = {}
    for local_id in TASK_PERSON_LINKS:
        value = objects(objects(objects(proposed.get("tarefas")).get("people")).get(local_id)).get("masterId")
        if value:
            updates[f"tarefas/people/{local_id}/masterId"] = value
    for speaker_id in SPEAKER_LINKS:
        speakers = objects(objects(objects(proposed.get("tarefas")).get("discursos")).get("oradores"))
        value = objects(speakers.get(speaker_id)).get("masterId")
        if value:
            updates[f"tarefas/discursos/oradores/{speaker_id}/masterId"] = value
    for local_id in SCALE_MASTER_LINKS:
        participants = objects(objects(proposed.get("escala")).get("participants"))
        value = objects(participants.get(local_id)).get("masterId")
        if value:
            updates[f"escala/participants/{local_id}/masterId"] = value
    for user_id in USER_LINKS:
        value = objects(objects(proposed.get("usuarios")).get(user_id)).get("masterId")
        if value:
            updates[f"usuarios/{user_id}/masterId"] = value

    old_profiles = objects(objects(main.get("programacao")).get("pessoas"))
    new_profiles = objects(objects(proposed.get("programacao")).get("pessoas"))
    for profile_id, profile in new_profiles.items():
        old_master = objects(old_profiles.get(profile_id)).get("masterId")
        new_master = objects(profile).get("masterId")
        if new_master and new_master != old_master:
            updates[f"programacao/pessoas/{profile_id}/masterId"] = new_master
    for program_id, program in objects(objects(proposed.get("programacao")).get("programs")).items():
        updates[f"programacao/programs/{program_id}"] = program

    for collection, records in objects(proposed.get("secretario")).items():
        if collection == "meta":
            updates["secretario/meta"] = records
        elif isinstance(records, dict):
            for record_id, record in records.items():
                updates[f"secretario/{collection}/{record_id}"] = record
    return dict(sorted(updates.items()))


def validate_proposal(proposed: dict[str, Any], source_hashes: dict[str, str], source_dir: Path) -> dict[str, Any]:
    master_people = objects(objects(proposed.get("master")).get("pessoas"))
    secretary = objects(proposed.get("secretario"))
    publishers = objects(secretary.get("publicadores"))
    reports = objects(secretary.get("relatorios"))
    attendance = objects(secretary.get("assistencia"))
    errors: list[str] = []
    for publisher_id, publisher in publishers.items():
        if objects(publisher).get("masterId") not in master_people:
            errors.append(f"publicador sem masterId valido: {publisher_id}")
    seen: set[tuple[str, str]] = set()
    for report_id, report in reports.items():
        value = objects(report)
        key = (text(value.get("masterId")), text(value.get("competencia")))
        if key[0] not in master_people:
            errors.append(f"relatorio sem masterId valido: {report_id}")
        if not re.fullmatch(r"\d{4}-\d{2}", key[1]):
            errors.append(f"competencia invalida: {report_id}")
        if key in seen:
            errors.append(f"relatorio duplicado: {key[0]} {key[1]}")
        seen.add(key)
        if report_id != f"{key[0]}__{key[1]}":
            errors.append(f"id de relatorio nao canonico: {report_id}")
    for attendance_id, item in attendance.items():
        try:
            date.fromisoformat(text(objects(item).get("data")))
        except ValueError:
            errors.append(f"assistencia com data invalida: {attendance_id}")
    for filename, expected in source_hashes.items():
        if sha256(source_dir / filename) != expected:
            errors.append(f"fonte alterada durante a migracao: {filename}")
    if errors:
        raise ValueError("; ".join(errors[:20]))
    return {
        "masterPeople": len(master_people),
        "secretaryPublishers": len(publishers),
        "secretaryReports": len(reports),
        "secretaryAttendance": len(attendance),
        "canonicalReports": len(seen),
        "errors": 0,
    }


def report_markdown(
    output: Path,
    source_hashes: dict[str, str],
    current_links: dict[str, int],
    secretary_counts: dict[str, int],
    program_counts: dict[str, int],
    remaining: dict[str, int],
    validation: dict[str, Any],
) -> str:
    hashes = "\n".join(f"- `{name}`: `{digest}`" for name, digest in source_hashes.items())
    links = "\n".join(f"- {name}: {count}" for name, count in sorted(current_links.items()))
    remains = "\n".join(f"- {name}: {count}" for name, count in sorted(remaining.items()))
    return f"""# Relatorio do pacote de migracao Firebase

Gerado em {datetime.now(timezone.utc).isoformat()}.

Este pacote e uma proposta local. Nenhum dado foi enviado ao Firebase e nenhum
arquivo-fonte foi alterado.

## Arquivos

- `firebase-import-proposto.json`: backup principal com correcoes e historicos propostos.
- `firebase-atualizacoes-por-caminho.json`: mapa aditivo para aplicacao futura via SDK.
- `PENDENCIAS-MIGRACAO.json`: copia separada das pendencias privadas.
- `manifesto-fontes.json`: hashes e tamanhos das fontes.
- `fontes-originais/`: copias imutaveis usadas nesta execucao.

## Correcoes de vinculo aplicadas

{links}

As chaves locais da Escala foram mantidas; somente o `masterId` interno foi
corrigido nos quatro casos comprovados, evitando quebrar tabelas historicas.

## Secretario

- Publicadores oficiais preparados: {secretary_counts['publicadores']}.
- Relatorios oficiais preparados: {secretary_counts['relatorios']}.
- Registros de assistencia preparados: {secretary_counts['assistencia']}.
- Competencias fechadas preservadas: {secretary_counts['fechamentos']}.
- Publicadores pendentes: {secretary_counts['publicadoresPendentes']}.
- Relatorios retidos por vinculo pendente: {secretary_counts['relatoriosPendentes']}.
- Assistencias invalidas retidas: {secretary_counts['assistenciaPendente']}.

`PioneerReport=-1` foi convertido em nao participacao; `0`, `1` e `2` foram
convertidos respectivamente em publicador, pioneiro auxiliar e pioneiro
regular. Horas de campo foram mantidas apenas para codigos `1` e `2`, conforme
o contrato atual do app. `HoursLDC + TSHours` alimenta atividades aprovadas.
`BibleStudies2` nao tinha valor diferente de zero e foi preservado apenas nos
metadados privados.

## Vida e Ministerio

- Alunos vinculados com criterio seguro: {program_counts['alunosMapeados']}.
- Perfis atuais reparados: {program_counts['perfisReparados']}.
- Programas historicos importados ate hoje: {program_counts['programasHistoricos']}.
- Semanas futuras mantidas para revisao: {program_counts['semanasFuturasPendentes']}.
- Referencias de designacao ainda pendentes: {program_counts['designacoesPendentes']}.

Programas futuros do backup antigo nao foram ativados. Semanas especiais e
discursos publicos antigos ficaram nas pendencias para nao interferir em
lembretes nem duplicar o historico atual de Oradores.

## Vinculos ainda invalidos na proposta

{remains}

Esses registros foram preservados, nao apagados. Eles exigem revisao de pessoa
antes de uma segunda proposta.

## Validacao local

- Pessoas no cadastro central: {validation['masterPeople']}.
- Relatorios canonicos e sem duplicidade: {validation['canonicalReports']}.
- Erros estruturais detectados: {validation['errors']}.
- Hashes das fontes conferidos depois da geracao: sim.

## Hashes das fontes

{hashes}

## Proximo passo

Revisar `PENDENCIAS-MIGRACAO.json` e o app local carregado com a proposta. A
importacao no Firebase continua bloqueada ate uma ordem especifica do Admin.
Nao restaure o JSON completo pelo Admin sobre um banco que tenha recebido dados
depois destas fontes. O mapa por caminho nao contem exclusoes, mas tambem deve
ser aplicado somente depois de baixar e comparar um backup fresco.
O arquivo de regras nao foi alterado, pois endurecer escrita sem Firebase
Authentication quebraria os fluxos atuais e exige uma decisao separada.
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--downloads", type=Path, default=Path.home() / "Downloads")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--allow-source-change", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_dir = args.downloads.resolve()
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    output = (args.output or source_dir / f"firebase-migracao-{stamp}").resolve()
    if output.exists():
        raise FileExistsError(f"a pasta de saida ja existe: {output}")
    source_paths = {name: source_dir / name for name in SOURCE_NAMES}
    missing = [str(path) for path in source_paths.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError("fontes ausentes: " + ", ".join(missing))
    source_hashes = {name: sha256(path) for name, path in source_paths.items()}
    changed = {
        name: {"expected": EXPECTED_HASHES.get(name), "actual": digest}
        for name, digest in source_hashes.items()
        if EXPECTED_HASHES.get(name) != digest
    }
    if changed and not args.allow_source_change:
        raise ValueError("hash de fonte diferente da auditoria; execute nova auditoria ou use --allow-source-change")

    output.mkdir(parents=True)
    originals = output / "fontes-originais"
    originals.mkdir()
    for name, path in source_paths.items():
        shutil.copy2(path, originals / name)

    main_source = load_json(source_paths["oradoress2-default-rtdb-export.json"])
    complementary_speakers = load_json(source_paths["oradores-tarefas-default-rtdb-export.json"])
    proposed = copy.deepcopy(main_source)
    master_people = objects(objects(proposed.get("master")).get("pessoas"))
    pending: dict[str, Any] = {
        "meta": {
            "private": True,
            "preparedAt": datetime.now(timezone.utc).isoformat(),
            "source": "migracao local auditada",
            "warning": "nao mover este no para caminhos com leitura publica",
        }
    }

    current_links = prepare_current_links(proposed, master_people)
    with open_sqlite_read_only(source_paths["ServiceSecretary.bss"]) as secretary:
        secretary_counts = prepare_secretary(proposed, secretary, master_people, pending)
        with open_sqlite_read_only(source_paths["dataMeeting.bks"]) as meeting:
            program_counts = prepare_program_history(
                proposed, meeting, secretary, master_people, pending
            )

    pending["oradores"] = {
        "registrosSomenteNaFonteComplementar": complementary_speaker_pendings(
            main_source, complementary_speakers
        )
    }
    remaining = remaining_link_counts(proposed, master_people)
    pending["vinculosAtuaisRestantes"] = remaining
    proposed["pendenciasMigracao"] = pending

    validation = validate_proposal(proposed, source_hashes, source_dir)
    update_map = build_update_map(main_source, proposed)
    proposed_path = output / "firebase-import-proposto.json"
    write_json(proposed_path, proposed)
    write_json(output / "firebase-atualizacoes-por-caminho.json", update_map)
    write_json(output / "PENDENCIAS-MIGRACAO.json", pending)
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": {
            name: {
                "sha256": digest,
                "size": source_paths[name].stat().st_size,
                "copy": f"fontes-originais/{name}",
            }
            for name, digest in source_hashes.items()
        },
        "proposed": {
            "file": proposed_path.name,
            "sha256": sha256(proposed_path),
            "size": proposed_path.stat().st_size,
        },
        "sourceHashChangesAccepted": changed,
    }
    write_json(output / "manifesto-fontes.json", manifest)
    (output / "RELATORIO-PACOTE-MIGRACAO.md").write_text(
        report_markdown(
            output, source_hashes, current_links, secretary_counts,
            program_counts, remaining, validation,
        ),
        encoding="utf-8",
    )
    print(output)
    print(json.dumps({
        "currentLinks": current_links,
        "secretary": secretary_counts,
        "programacao": program_counts,
        "remainingLinks": remaining,
        "validation": validation,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
