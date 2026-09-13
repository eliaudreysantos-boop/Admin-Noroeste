#!/usr/bin/env python3
"""Audit legacy Firebase/SQLite exports without modifying source data."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable


SOURCE_NAMES = (
    "oradoress2-default-rtdb-export.json",
    "tpl-novo-2-default-rtdb-export.json",
    "oradores-tarefas-default-rtdb-export.json",
    "dataMeeting.bks",
    "ServiceSecretary.bss",
)


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


def masked_phone(value: Any) -> str:
    digits = normalized_phone(value)
    return f"***{digits[-4:]}" if digits else "nao informado"


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
        raise ValueError(f"{path.name} nao possui um objeto na raiz")
    return value


def open_sqlite_read_only(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def sqlite_rows(connection: sqlite3.Connection, table: str) -> list[sqlite3.Row]:
    return connection.execute(f'SELECT * FROM "{table}"').fetchall()


def sqlite_tables(connection: sqlite3.Connection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }


@dataclass(frozen=True)
class PersonSuggestion:
    master_id: str
    name: str
    score: float
    reason: str
    confidence: str


class PersonIndex:
    def __init__(self, people: dict[str, Any]):
        self.people = people
        self.by_name: dict[str, list[str]] = defaultdict(list)
        self.by_phone: dict[str, list[str]] = defaultdict(list)
        for master_id, raw in people.items():
            person = objects(raw)
            name_key = normalized_name(person.get("name"))
            phone_key = normalized_phone(person.get("whatsapp"))
            if name_key:
                self.by_name[name_key].append(master_id)
            if phone_key:
                self.by_phone[phone_key].append(master_id)

    def valid(self, master_id: Any) -> bool:
        return text(master_id) in self.people

    def suggestions(self, name: Any, phone: Any = "") -> list[PersonSuggestion]:
        name_key = normalized_name(name)
        phone_key = normalized_phone(phone)
        exact = self.by_name.get(name_key, []) if name_key else []
        if len(exact) == 1:
            master_id = exact[0]
            return [PersonSuggestion(master_id, text(self.people[master_id].get("name")), 1.0, "nome completo normalizado", "alta")]

        phone_hits = self.by_phone.get(phone_key, []) if phone_key else []
        scored: list[tuple[float, str, str]] = []
        source_tokens = name_key.split()
        for master_id, raw in self.people.items():
            candidate = normalized_name(objects(raw).get("name"))
            if not candidate or not name_key:
                continue
            candidate_tokens = candidate.split()
            ratio = SequenceMatcher(None, name_key, candidate).ratio()
            reason = "similaridade de nome"
            score = ratio
            if source_tokens and all(token in candidate_tokens for token in source_tokens):
                score = max(score, 0.94)
                reason = "nome abreviado contido no nome completo"
            elif len(source_tokens) >= 2 and len(candidate_tokens) >= 2 and source_tokens[0] == candidate_tokens[0] and source_tokens[-1] == candidate_tokens[-1]:
                score = max(score, 0.92)
                reason = "primeiro e ultimo nomes coincidem"
            if master_id in phone_hits:
                score = min(0.99, score + 0.08)
                reason += "; telefone unico como pista" if len(phone_hits) == 1 else "; telefone compartilhado"
            scored.append((score, master_id, reason))

        scored.sort(key=lambda item: (-item[0], text(self.people[item[1]].get("name"))))
        result: list[PersonSuggestion] = []
        for score, master_id, reason in scored[:3]:
            if score < 0.58:
                continue
            confidence = "media" if score >= 0.88 else "baixa"
            if len(phone_hits) > 1 and master_id in phone_hits:
                confidence = "baixa"
            result.append(PersonSuggestion(master_id, text(self.people[master_id].get("name")), score, reason, confidence))
        if not result and len(phone_hits) == 1:
            master_id = phone_hits[0]
            result.append(PersonSuggestion(master_id, text(self.people[master_id].get("name")), 0.82, "telefone unico, apenas como pista", "media"))
        return result


@dataclass
class Issue:
    module: str
    path: str
    kind: str
    local_id: str
    local_name: str = ""
    local_phone: str = ""
    current_master_id: str = ""
    detail: str = ""
    suggestions: list[PersonSuggestion] | None = None


def issue_lines(issue: Issue, number: int) -> list[str]:
    lines = [
        f"### {number}. {issue.module}: {issue.kind}",
        "",
        f"- Caminho: `{issue.path}`",
        f"- ID local: `{issue.local_id}`",
    ]
    if issue.current_master_id:
        lines.append(f"- `masterId` atual: `{issue.current_master_id}`")
    if issue.local_name:
        lines.append(f"- Nome local: {issue.local_name}")
    if issue.local_phone:
        lines.append(f"- Telefone local: {masked_phone(issue.local_phone)}")
    if issue.detail:
        lines.append(f"- Detalhe: {issue.detail}")
    suggestions = issue.suggestions or []
    if suggestions:
        lines.append("- Sugestoes:")
        for suggestion in suggestions:
            lines.append(
                f"  - `{suggestion.master_id}` - {suggestion.name}; "
                f"confianca {suggestion.confidence}; {suggestion.reason}; "
                f"pontuacao {suggestion.score:.2f}."
            )
    else:
        lines.append("- Sugestoes: nenhuma com seguranca suficiente.")
    exact = len(suggestions) == 1 and suggestions[0].confidence == "alta"
    action = "revisar e incluir na futura proposta" if exact else "revisao manual obrigatoria"
    lines.extend([f"- Acao recomendada: {action}.", ""])
    return lines


def collection_link_issues(
    module: str,
    path: str,
    collection: Any,
    people_index: PersonIndex,
    name_fields: Iterable[str],
    phone_fields: Iterable[str] = (),
    active_field: str | None = None,
) -> list[Issue]:
    issues: list[Issue] = []
    used: dict[str, list[str]] = defaultdict(list)
    for local_id, raw in objects(collection).items():
        record = objects(raw)
        master_id = text(record.get("masterId"))
        local_name = next((text(record.get(field)) for field in name_fields if text(record.get(field))), "")
        local_phone = next((text(record.get(field)) for field in phone_fields if text(record.get(field))), "")
        if people_index.valid(master_id):
            used[master_id].append(local_id)
            continue
        kind = "masterId ausente" if not master_id else "masterId inexistente"
        issues.append(
            Issue(
                module=module,
                path=f"{path}/{local_id}",
                kind=kind,
                local_id=local_id,
                local_name=local_name,
                local_phone=local_phone,
                current_master_id=master_id,
                detail=(
                    f"Registro {'inativo' if active_field and record.get(active_field) is False else 'ativo ou sem situacao explicita'} preservado; "
                    "nenhuma correcao foi aplicada."
                ),
                suggestions=people_index.suggestions(local_name, local_phone),
            )
        )
    for master_id, local_ids in used.items():
        if len(local_ids) < 2:
            continue
        for local_id in local_ids:
            issues.append(
                Issue(
                    module=module,
                    path=f"{path}/{local_id}",
                    kind="vinculo duplicado",
                    local_id=local_id,
                    current_master_id=master_id,
                    detail=f"O mesmo masterId aparece em: {', '.join(local_ids)}.",
                )
            )
    return issues


def full_name(row: sqlite3.Row, fields: Iterable[str]) -> str:
    return " ".join(text(row[field]) for field in fields if text(row[field]))


def source_manifest(paths: dict[str, Path]) -> list[dict[str, Any]]:
    return [
        {
            "name": name,
            "bytes": paths[name].stat().st_size,
            "modified": datetime.fromtimestamp(paths[name].stat().st_mtime).astimezone().isoformat(timespec="seconds"),
            "sha256": sha256(paths[name]),
        }
        for name in SOURCE_NAMES
    ]


def manifest_lines(manifest: list[dict[str, Any]]) -> list[str]:
    lines = ["## Fontes verificadas", "", "| Arquivo | Bytes | SHA-256 |", "| --- | ---: | --- |"]
    for item in manifest:
        lines.append(f"| `{item['name']}` | {item['bytes']} | `{item['sha256']}` |")
    lines.append("")
    return lines


def legacy_secretary_issues(
    connection: sqlite3.Connection,
    people_index: PersonIndex,
) -> tuple[list[Issue], dict[str, int]]:
    issues: list[Issue] = []
    publishers = sqlite_rows(connection, "publishers")
    publisher_ids = {int(row["_id"]) for row in publishers}
    exact = 0
    for row in publishers:
        name = full_name(row, ("FirstName", "MiddleName", "LastName"))
        suggestions = people_index.suggestions(name, row["PhoneMobile"])
        is_exact = len(suggestions) == 1 and suggestions[0].confidence == "alta"
        if is_exact:
            exact += 1
            continue
        issues.append(
            Issue(
                module="Secretario legado",
                path=f"ServiceSecretary.bss/publishers/{row['_id']}",
                kind="publicador sem correspondencia exata",
                local_id=str(row["_id"]),
                local_name=name,
                local_phone=text(row["PhoneMobile"]),
                detail=f"Situacao no legado: {'inativo' if row['Disabled'] else 'ativo'}.",
                suggestions=suggestions,
            )
        )

    reports = sqlite_rows(connection, "reports")
    report_keys: Counter[tuple[int, int, int]] = Counter()
    orphan_reports = 0
    invalid_reports = 0
    for row in reports:
        publisher_id = int(row["idPublisher"])
        year, month = int(row["Year"]), int(row["Month"])
        report_keys[(publisher_id, year, month)] += 1
        if publisher_id not in publisher_ids:
            orphan_reports += 1
        if not 2000 <= year <= 2100 or not 0 <= month <= 11:
            invalid_reports += 1
    duplicate_reports = sum(count - 1 for count in report_keys.values() if count > 1)

    attendance = sqlite_rows(connection, "attendance")
    invalid_attendance = 0
    for row in attendance:
        year, month, day = int(row["Year"]), int(row["Month"]), int(row["Day"])
        if not 2000 <= year <= 2100 or not 0 <= month <= 11 or not 1 <= day <= 31:
            invalid_attendance += 1
            issues.append(
                Issue(
                    module="Secretario legado",
                    path=f"ServiceSecretary.bss/attendance/{row['_id']}",
                    kind="data invalida",
                    local_id=str(row["_id"]),
                    detail=f"Data legada: dia={day}, mes={month}, ano={year}; codigo de reuniao={row['Meeting']}.",
                )
            )
    stats = {
        "publishers": len(publishers),
        "exact_publishers": exact,
        "unmatched_publishers": len(publishers) - exact,
        "reports": len(reports),
        "orphan_reports": orphan_reports,
        "invalid_reports": invalid_reports,
        "duplicate_reports": duplicate_reports,
        "attendance": len(attendance),
        "invalid_attendance": invalid_attendance,
    }
    return issues, stats


def legacy_meeting_issues(
    connection: sqlite3.Connection,
    current_profiles: dict[str, Any],
    people_index: PersonIndex,
) -> tuple[list[Issue], dict[str, int]]:
    issues: list[Issue] = []
    students = sqlite_rows(connection, "students")
    student_ids = {int(row["_id"]) for row in students}
    profiles_by_debug: dict[str, list[str]] = defaultdict(list)
    for profile_id, raw in current_profiles.items():
        key = normalized_name(objects(raw).get("_nome_debug"))
        if key:
            profiles_by_debug[key].append(profile_id)

    profile_matches = 0
    for row in students:
        name = full_name(row, ("FirstName", "LastName"))
        matches = profiles_by_debug.get(normalized_name(name), [])
        if len(matches) == 1:
            profile_matches += 1
            continue
        if int(row["_id"]) == -1:
            continue
        suggestions = people_index.suggestions(name, row["PhoneMobile"])
        issues.append(
            Issue(
                module="Vida e Ministerio legado",
                path=f"dataMeeting.bks/students/{row['_id']}",
                kind="aluno sem perfil atual unico",
                local_id=str(row["_id"]),
                local_name=name,
                local_phone=text(row["PhoneMobile"]),
                detail=f"Perfis atuais com o mesmo _nome_debug: {', '.join(matches) if matches else 'nenhum'}.",
                suggestions=suggestions,
            )
        )

    orphan_refs = 0
    invalid_dates = 0
    for table, person_fields in (
        ("assignments", ("idStudent", "idAssistant")),
        ("midweek_assignments", ("idChairmanLAMM", "idPrayerO", "idTreasures", "idGems", "idDiscussion0", "idDiscussion1", "idDiscussion2", "idCounselor1", "idCounselor2", "idLiving1", "idLiving2", "idLiving3", "idCongregationBS", "idReaderBS", "idPrayerC")),
        ("publictalks_assignments", ("idStudent", "idChairman", "idReader", "idPrayerC")),
    ):
        for row in sqlite_rows(connection, table):
            year, month, day = int(row["Year"]), int(row["Month"]), int(row["Day"])
            if not 2000 <= year <= 2100 or not 0 <= month <= 11 or not 1 <= day <= 31:
                invalid_dates += 1
            for field in person_fields:
                person_id = row[field]
                if person_id is not None and int(person_id) > 0 and int(person_id) not in student_ids:
                    orphan_refs += 1

    stats = {
        "students": len(students),
        "profiles_by_debug": profile_matches,
        "students_without_unique_profile": len(students) - profile_matches - 1,
        "assignments": len(sqlite_rows(connection, "assignments")),
        "midweek_assignments": len(sqlite_rows(connection, "midweek_assignments")),
        "publictalk_assignments": len(sqlite_rows(connection, "publictalks_assignments")),
        "orphan_person_references": orphan_refs,
        "invalid_dates": invalid_dates,
    }
    return issues, stats


def changed_fields(left: Any, right: Any, prefix: str = "") -> list[str]:
    if isinstance(left, dict) and isinstance(right, dict):
        result: list[str] = []
        keys = sorted(set(left) | set(right))
        for key in keys:
            path = f"{prefix}.{key}" if prefix else str(key)
            if key not in left:
                result.append(f"{path} (somente complementar)")
            elif key not in right:
                result.append(f"{path} (somente principal)")
            else:
                result.extend(changed_fields(left[key], right[key], path))
        return result
    if isinstance(left, list) and isinstance(right, list):
        return [] if left == right else [prefix or "valor"]
    return [] if left == right else [prefix or "valor"]


def comparison_section(path: str, current: Any, complementary: Any) -> tuple[list[str], dict[str, int]]:
    left, right = objects(current), objects(complementary)
    left_keys, right_keys = set(left), set(right)
    only_current = sorted(left_keys - right_keys)
    only_complementary = sorted(right_keys - left_keys)
    common = sorted(left_keys & right_keys)
    changed: list[tuple[str, list[str]]] = []
    equal = 0
    for key in common:
        fields = changed_fields(left[key], right[key])
        if fields:
            changed.append((key, fields))
        else:
            equal += 1
    lines = [f"### `{path}`", "", f"- Iguais: {equal}", f"- Alterados: {len(changed)}", f"- Somente no principal: {len(only_current)}", f"- Somente no complementar: {len(only_complementary)}", ""]
    if only_current:
        lines.extend(["Somente no principal:", "", *[f"- `{key}`" for key in only_current], ""])
    if only_complementary:
        lines.extend(["Somente no complementar:", "", *[f"- `{key}`" for key in only_complementary], ""])
    if changed:
        lines.extend(["Registros alterados:", ""])
        for key, fields in changed:
            shown = fields[:20]
            suffix = f"; mais {len(fields) - len(shown)} campo(s)" if len(fields) > len(shown) else ""
            lines.append(f"- `{key}`: {', '.join(f'`{field}`' for field in shown)}{suffix}")
        lines.append("")
    return lines, {
        "equal": equal,
        "changed": len(changed),
        "only_current": len(only_current),
        "only_complementary": len(only_complementary),
    }


def build_link_report(
    main: dict[str, Any],
    secretary: sqlite3.Connection,
    meeting: sqlite3.Connection,
    manifest: list[dict[str, Any]],
) -> str:
    master_people = objects(objects(main.get("master")).get("pessoas"))
    people_index = PersonIndex(master_people)
    tarefas = objects(main.get("tarefas"))
    escala = objects(main.get("escala"))
    programacao = objects(main.get("programacao"))
    users = objects(main.get("usuarios"))
    discursos = objects(tarefas.get("discursos"))

    issues: list[Issue] = []
    issues.extend(collection_link_issues("Tarefas", "tarefas/people", tarefas.get("people"), people_index, ("name",), ("phone",), "active"))
    issues.extend(collection_link_issues("Escala TPL", "escala/participants", escala.get("participants"), people_index, ("name", "_nome_debug"), ("phone", "whatsapp"), "active"))
    issues.extend(collection_link_issues("Vida e Ministerio", "programacao/pessoas", programacao.get("pessoas"), people_index, ("_nome_debug", "name"), ("phone", "whatsapp"), "active"))
    issues.extend(collection_link_issues("Usuarios", "usuarios", users, people_index, ("nome", "name"), ("whatsapp", "phone"), "ativo"))

    task_people = objects(tarefas.get("people"))
    for speaker_id, raw in objects(discursos.get("oradores")).items():
        speaker = objects(raw)
        if speaker.get("tipo") == "visitante":
            continue
        direct = text(speaker.get("masterId"))
        task_id = text(speaker.get("pessoaId"))
        indirect = text(objects(task_people.get(task_id)).get("masterId")) if task_id else ""
        master_id = direct or indirect
        if people_index.valid(master_id):
            continue
        local_name = text(speaker.get("nome") or speaker.get("name"))
        issues.append(
            Issue(
                module="Oradores",
                path=f"tarefas/discursos/oradores/{speaker_id}",
                kind="orador local sem vinculo valido",
                local_id=speaker_id,
                local_name=local_name,
                local_phone=text(speaker.get("telefone")),
                current_master_id=master_id,
                detail=f"pessoaId em Tarefas: {task_id or 'ausente'}; situacao: {'inativo' if speaker.get('ativo') is False else 'ativo ou nao informada'}.",
                suggestions=people_index.suggestions(local_name, speaker.get("telefone")),
            )
        )

    secretary_issues, secretary_stats = legacy_secretary_issues(secretary, people_index)
    meeting_issues, meeting_stats = legacy_meeting_issues(meeting, objects(programacao.get("pessoas")), people_index)
    issues.extend(secretary_issues)
    issues.extend(meeting_issues)
    issues.sort(key=lambda item: (item.module, item.kind, item.local_name, item.local_id))

    duplicate_names = {key: ids for key, ids in people_index.by_name.items() if len(ids) > 1}
    shared_phones = {key: ids for key, ids in people_index.by_phone.items() if len(ids) > 1}
    counts = Counter(issue.module for issue in issues)
    lines = [
        "# Relatorio de falhas e sugestoes de vinculo",
        "",
        f"Gerado em: {datetime.now().astimezone().isoformat(timespec='seconds')}",
        "",
        "Este relatorio e somente leitura. Nenhum dado, vinculo ou historico foi alterado. Senhas nao sao incluidas e telefones aparecem mascarados.",
        "",
        *manifest_lines(manifest),
        "## Resumo",
        "",
        f"- Pessoas em `master/pessoas`: {len(master_people)}.",
        f"- Falhas e itens para revisao: {len(issues)}.",
        f"- Nomes duplicados no cadastro central: {len(duplicate_names)}.",
        f"- Telefones compartilhados no cadastro central: {len(shared_phones)}; sao permitidos e nao foram tratados como erro.",
        f"- Secretario legado: {secretary_stats['exact_publishers']} de {secretary_stats['publishers']} publicadores com nome completo exato e unico.",
        f"- Secretario legado: {secretary_stats['reports']} relatorios, {secretary_stats['duplicate_reports']} duplicidade(s) por pessoa/competencia, {secretary_stats['orphan_reports']} referencia(s) orfa(s) e {secretary_stats['invalid_reports']} data(s) de relatorio invalida(s).",
        f"- Assistencia legada: {secretary_stats['attendance']} registros e {secretary_stats['invalid_attendance']} data(s) invalida(s).",
        f"- Vida e Ministerio legado: {meeting_stats['profiles_by_debug']} de {meeting_stats['students']} alunos encontrados por `_nome_debug` em perfil atual.",
        f"- Vida e Ministerio legado: {meeting_stats['orphan_person_references']} referencia(s) orfa(s) e {meeting_stats['invalid_dates']} data(s) invalida(s) nas designacoes.",
        "",
        "### Itens por modulo",
        "",
        "| Modulo | Itens |",
        "| --- | ---: |",
        *[f"| {module} | {count} |" for module, count in sorted(counts.items())],
        "",
        "## Regras de interpretacao",
        "",
        "- Confianca alta significa somente nome completo normalizado e unico.",
        "- Confianca media ou baixa e apenas sugestao e exige revisao humana.",
        "- Telefone e pista auxiliar. Telefone compartilhado nunca escolhe uma pessoa automaticamente.",
        "- Registros antigos, inativos ou sem vinculo permanecem preservados.",
        "",
        "## Itens detalhados",
        "",
    ]
    if issues:
        for number, issue in enumerate(issues, 1):
            lines.extend(issue_lines(issue, number))
    else:
        lines.extend(["Nenhuma falha encontrada.", ""])
    return "\n".join(lines)


def build_comparison_report(
    main: dict[str, Any],
    escala_legacy: dict[str, Any],
    tarefas_legacy: dict[str, Any],
    manifest: list[dict[str, Any]],
) -> str:
    sections: list[str] = []
    summary: list[tuple[str, dict[str, int]]] = []

    current_escala = objects(main.get("escala"))
    for key in sorted(set(current_escala) | set(escala_legacy)):
        lines, stats = comparison_section(f"escala/{key}", current_escala.get(key), escala_legacy.get(key))
        sections.extend(lines)
        summary.append((f"escala/{key}", stats))

    current_tarefas = objects(main.get("tarefas"))
    for key in sorted(set(current_tarefas) | set(tarefas_legacy)):
        if key == "discursos":
            current_discursos = objects(current_tarefas.get("discursos"))
            legacy_discursos = objects(tarefas_legacy.get("discursos"))
            for child in sorted(set(current_discursos) | set(legacy_discursos)):
                lines, stats = comparison_section(
                    f"tarefas/discursos/{child}",
                    current_discursos.get(child),
                    legacy_discursos.get(child),
                )
                sections.extend(lines)
                summary.append((f"tarefas/discursos/{child}", stats))
            continue
        lines, stats = comparison_section(f"tarefas/{key}", current_tarefas.get(key), tarefas_legacy.get(key))
        sections.extend(lines)
        summary.append((f"tarefas/{key}", stats))

    totals = Counter()
    for _, stats in summary:
        totals.update(stats)
    lines = [
        "# Comparacao entre backup principal e fontes complementares",
        "",
        f"Gerado em: {datetime.now().astimezone().isoformat(timespec='seconds')}",
        "",
        "Este relatorio compara os arquivos sem alterar nenhum deles. O backup principal e tratado como estado atual; diferencas no complementar sao apenas candidatas a revisao.",
        "",
        *manifest_lines(manifest),
        "## Resumo geral",
        "",
        f"- Caminhos comparados: {len(summary)}.",
        f"- Registros iguais: {totals['equal']}.",
        f"- Registros alterados: {totals['changed']}.",
        f"- Registros somente no principal: {totals['only_current']}.",
        f"- Registros somente no complementar: {totals['only_complementary']}.",
        "",
        "| Caminho | Iguais | Alterados | So principal | So complementar |",
        "| --- | ---: | ---: | ---: | ---: |",
        *[
            f"| `{path}` | {stats['equal']} | {stats['changed']} | {stats['only_current']} | {stats['only_complementary']} |"
            for path, stats in summary
        ],
        "",
        "## Diferencas por registro",
        "",
        *sections,
        "## Regra para a futura proposta",
        "",
        "- Nao substituir `escala` ou `tarefas` inteiros pela fonte complementar.",
        "- Revisar cada registro somente no complementar antes de recupera-lo.",
        "- Em registros alterados, preservar o principal ate que a diferenca seja entendida.",
        "- Dados historicos podem ser acrescentados somente com chave nova e verificacao de duplicidade.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Audita backups Firebase e SQLite sem alterar dados.")
    parser.add_argument("--downloads", type=Path, default=Path.home() / "Downloads")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    downloads = args.downloads.resolve()
    paths = {name: downloads / name for name in SOURCE_NAMES}
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError("Fontes ausentes:\n" + "\n".join(missing))

    output = args.output or downloads / f"firebase-auditoria-{datetime.now().strftime('%Y-%m-%d-%H%M%S')}"
    output.mkdir(parents=True, exist_ok=False)

    manifest = source_manifest(paths)
    main_data = load_json(paths["oradoress2-default-rtdb-export.json"])
    escala_legacy = load_json(paths["tpl-novo-2-default-rtdb-export.json"])
    tarefas_legacy = load_json(paths["oradores-tarefas-default-rtdb-export.json"])

    with open_sqlite_read_only(paths["ServiceSecretary.bss"]) as secretary, open_sqlite_read_only(paths["dataMeeting.bks"]) as meeting:
        required_secretary = {"publishers", "reports", "attendance"}
        required_meeting = {"students", "assignments", "midweek_assignments", "publictalks_assignments"}
        if not required_secretary.issubset(sqlite_tables(secretary)):
            raise ValueError("ServiceSecretary.bss nao possui todas as tabelas esperadas")
        if not required_meeting.issubset(sqlite_tables(meeting)):
            raise ValueError("dataMeeting.bks nao possui todas as tabelas esperadas")
        link_report = build_link_report(main_data, secretary, meeting, manifest)

    comparison_report = build_comparison_report(main_data, escala_legacy, tarefas_legacy, manifest)
    (output / "RELATORIO-FALHAS-VINCULOS.md").write_text(link_report, encoding="utf-8", newline="\n")
    (output / "RELATORIO-COMPARACAO-FONTES.md").write_text(comparison_report, encoding="utf-8", newline="\n")

    print(str(output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
