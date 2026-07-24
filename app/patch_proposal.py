#!/usr/bin/env python3
"""
HONO Proposal Patcher
Patches the unpacked HONO base template XML with client-specific data.

Usage:
    python patch_proposal.py config.json

The config.json must point to an already-unpacked directory via "unpacked_dir".
Run merge_runs.py on the unpacked dir BEFORE calling this script.
"""

import json, re, os, sys

def ordinal_suffix(day):
    d = int(day)
    if 11 <= d <= 13:
        return 'th'
    return {1: 'st', 2: 'nd', 3: 'rd'}.get(d % 10, 'th')

def fmt_number(n):
    return f"{int(n):,}"

def country_breakdown_volume(countries):
    """Returns the volume-column country list, e.g. Singapore: 138 · Indonesia: 153"""
    return ' · '.join(f"{c['name']}: {c['count']}" for c in countries)

def country_breakdown_prose(countries):
    """Returns the Proposal Note prose list, e.g. Singapore (138), Indonesia (153), and Philippines (25)."""
    parts = [f"{c['name']} ({c['count']})" for c in countries]
    if len(parts) == 1:
        return parts[0]
    return ', '.join(parts[:-1]) + ', and ' + parts[-1]

def remove_empty_bullets(xml):
    """Remove <w:p> elements that have numPr but no visible text — ghost bullets left after module removal."""
    def has_real_text(para_xml):
        texts = re.findall(r'<w:t[^>]*>([^<]+)</w:t>', para_xml)
        return any(t.strip() for t in texts)

    paras = re.split(r'(?=<w:p[ >])', xml)
    result = []
    for p in paras:
        if '<w:numPr>' in p and not has_real_text(p) and '</w:p>' in p:
            continue  # drop ghost bullet
        result.append(p)
    return ''.join(result)

def patch(config_path):
    with open(config_path, encoding='utf-8') as f:
        c = json.load(f)

    doc_path = os.path.join(c['unpacked_dir'], 'word', 'document.xml')
    with open(doc_path, encoding='utf-8') as f:
        xml = f.read()

    errors = []
    applied = []

    # ── Helpers ──────────────────────────────────────────────────────────────
    def replace(old, new, label):
        nonlocal xml
        count = xml.count(old)
        if count == 0:
            errors.append(f"NOT FOUND: {label}")
        else:
            xml = xml.replace(old, new)
            applied.append(f"✓ [{count}x] {label}")

    # ── 1. Organisation name ─────────────────────────────────────────────────
    replace('Singapore Institute of Management', c['client_name'], 'Client name')

    # ── 2. Salutation ────────────────────────────────────────────────────────
    replace('Dear Keerthana,', f"Dear {c['contact_name']},", 'Salutation')

    # ── 3. Proposal ID ───────────────────────────────────────────────────────
    # Find existing Proposal ID pattern and replace
    d = c['proposal_date']
    date_ddmmyyyy = f"{d['day']:02d}{d['month'][:3].upper()}{d['year']}"
    # Try common old IDs from the base template
    for old_id in ['SIM-FULLSUITE-01072026', 'SIM-PAYROLL-01072026']:
        if old_id in xml:
            new_id = f"{c['client_code']}-{c['scope'].upper()}-{d['day']:02d}07{d['year']}"
            replace(old_id, new_id, 'Proposal ID')
            break
    else:
        errors.append('Proposal ID: no known old ID found to replace — check manually')

    # ── 4. Cover page date (OOXML superscript pattern) ───────────────────────
    new_day = str(d['day'])
    new_suffix = d.get('suffix') or ordinal_suffix(d['day'])
    new_month_year = f"{d['month']} {d['year']}"
    # Regex: matches " {digit(s)}</w:t> ... superscript ... <w:t>{suffix}</w:t> ... <w:t> {month} {year}"
    date_pattern = re.compile(
        r'(<w:t xml:space="preserve"> )\d+?(</w:t></w:r><w:r><w:rPr>(?:(?!</w:rPr>).)*?'
        r'<w:vertAlign w:val="superscript"/>(?:(?!</w:rPr>).)*?</w:rPr><w:t>)\w+(</w:t></w:r>'
        r'<w:r><w:rPr>(?:(?!</w:rPr>).)*?</w:rPr><w:t xml:space="preserve"> )\w+ \d{4}',
        re.DOTALL
    )
    new_xml, n = date_pattern.subn(
        lambda m: m.group(1) + new_day + m.group(2) + new_suffix + m.group(3) + new_month_year,
        xml
    )
    if n > 0:
        xml = new_xml
        applied.append(f"✓ [regex] Cover date → {new_day} {new_suffix} {new_month_year}")
    else:
        errors.append('Cover date: superscript pattern not matched — update manually')

    # ── 5. Headcount ─────────────────────────────────────────────────────────
    hc = c['headcount']
    total = hc['total']
    total_str = fmt_number(total)
    countries = hc['countries']
    n_countries = len(countries)

    # "1,377 Employees" / "527 Employees"
    # Find whatever number appears before " Employees" in the commercial table
    xml = re.sub(r'\b1,377 Employees\b', f'{total_str} Employees', xml)
    xml = re.sub(r'\b527 Employees\b', f'{total_str} Employees', xml)
    xml = re.sub(r'\b1,696 Employees\b', f'{total_str} Employees', xml)
    applied.append(f"✓ Headcount label → {total_str} Employees")

    # "1,377 employees" / "527 employees" (lowercase — PEPM formula, threshold, description)
    xml = re.sub(r'\b1,377 employees\b', f'{total_str} employees', xml)
    xml = re.sub(r'\b527 employees\b', f'{total_str} employees', xml)
    xml = re.sub(r'\b1,696 employees\b', f'{total_str} employees', xml)
    applied.append(f"✓ Headcount references → {total_str} employees")

    # Country volume-column breakdown
    new_breakdown = country_breakdown_volume(countries)
    # Replace any existing breakdown pattern
    breakdown_pattern = re.compile(
        r'Singapore: \d+ ·[^<]{0,400}(?:Philippines: \d+|Malaysia: \d+)'
    )
    xml, n = breakdown_pattern.subn(new_breakdown, xml)
    if n > 0:
        applied.append(f"✓ Volume-column country breakdown → {new_breakdown}")
    else:
        errors.append('Volume-column country breakdown: pattern not matched')

    # Proposal Note workforce sentence — strip SIM FT/PT/Contingent and rebuild cleanly
    # Old pattern: "— 540 Full-Time, 474 Part-Time, and 351 Contingent employees in X employees across N countries: ..."
    old_sim_text_pattern = re.compile(
        r' — \d+ Full-Time,? \d+ Part-Time,? and \d+ Contingent employees in '
        r'[\d,]+ employees across \d+ countries: [^<]+\.'
    )
    new_prose = f' across {n_countries} countries: {country_breakdown_prose(countries)}.'
    xml, n = old_sim_text_pattern.subn(new_prose, xml)
    if n > 0:
        applied.append('✓ Stripped SIM FT/PT/Contingent breakdown from Proposal Note')
    else:
        # Also try fixing an already-partially-replaced version
        partial_pattern = re.compile(
            r' across \d+ countries: [^<]+\.'
        )
        xml, n2 = partial_pattern.subn(new_prose, xml)
        if n2 > 0:
            applied.append('✓ Updated Proposal Note country list (partial replacement)')
        else:
            errors.append('Proposal Note workforce sentence: not matched — check manually')

    # Also fix "in X employees across N countries" narrative (non-SIM-breakdown version)
    xml = re.sub(
        r'in [\d,]+ employees across \d+ countries: [^<]+\.',
        f'in {total_str} employees across {n_countries} countries: {country_breakdown_prose(countries)}.',
        xml
    )

    # ── 6. Pricing ───────────────────────────────────────────────────────────
    pepm = c['pricing']['pepm']
    currency = c['pricing']['currency']
    annual = total * pepm * 12
    impl = round(annual * 0.75)
    annual_str = fmt_number(annual)
    impl_str = fmt_number(impl)

    # Annual fee — the amount is split from "per annum" across runs
    # Replace old amounts by searching for the number+space pattern
    for old_annual in ['132,192', '50,592', '162,816', '99,144']:
        if f'>{old_annual} </w:t>' in xml:
            xml = xml.replace(f'>{old_annual} </w:t>', f'>{annual_str} </w:t>')
            applied.append(f'✓ Annual fee {old_annual} → {annual_str}')
            break
    else:
        errors.append(f'Annual fee: no known old amount found — expected {annual_str}')

    # PEPM formula line: "527 employees x USD 8 x 12 months"
    xml = re.sub(
        r'[\d,]+ employees x [A-Z]+ \d+ x 12 months',
        f'{total_str} employees x {currency} {pepm} x 12 months',
        xml
    )
    applied.append('✓ PEPM formula line updated')

    # Implementation fee — also split across runs
    for old_impl in ['99,144', '37,944', '122,112', '74,358']:
        if f'>{old_impl} </w:t>' in xml:
            xml = xml.replace(f'>{old_impl} </w:t>', f'>{impl_str} </w:t>', 1)
            applied.append(f'✓ Impl fee {old_impl} → {impl_str}')
            break
        elif old_impl in xml:  # not split
            xml = xml.replace(old_impl, impl_str, 1)
            applied.append(f'✓ Impl fee {old_impl} → {impl_str}')
            break
    else:
        errors.append(f'Impl fee: no known old amount found — expected {impl_str}')

    # ── 7. Modules ───────────────────────────────────────────────────────────
    mods = c.get('modules', {})

    # Remove modules entirely
    for mod in mods.get('remove', []):
        # Remove the bullet line containing this module name
        pattern = re.compile(
            r'<w:p [^>]+>(?:(?!<w:p ).)*?' + re.escape(mod) + r'.*?</w:p>',
            re.DOTALL
        )
        xml, n = pattern.subn('', xml)
        if n > 0:
            applied.append(f'✓ Removed module: {mod}')
        else:
            errors.append(f'Remove module: "{mod}" not found')

    # Defer attendance (Non-AF style)
    if mods.get('defer_attendance'):
        old_leave = '• Leave Management </w:t>'
        new_leave = '• Leave Management (Note: Attendance &amp; Overtime deferred to future phase) </w:t>'
        if old_leave in xml:
            xml = xml.replace(old_leave, new_leave)
            applied.append('✓ Leave Management: Attendance deferred note added')
        else:
            errors.append('Defer attendance: Leave Management bullet not found')
    else:
        # Attendance is included — use "Leave, Attendance, and Overtime Management"
        for old_leave in [
            '• Leave Management (Note: Attendance &amp; Overtime deferred to future phase) </w:t>',
            '• Leave Management </w:t>',
        ]:
            if old_leave in xml:
                xml = xml.replace(old_leave, '• Leave, Attendance, and Overtime Management </w:t>')
                applied.append('✓ Leave Management: Attendance & Overtime included')
                break

    # LMS Phase 2 note
    if mods.get('phase2_lms', True):  # default True — LMS is always Phase 2
        lms_old = '• Learning Management System and assessment </w:t>'
        lms_new = '• Learning Management System and assessment (Note: Phase 2 – to be scoped in future phase) </w:t>'
        if lms_old in xml:
            xml = xml.replace(lms_old, lms_new)
            applied.append('✓ LMS Phase 2 note added')
        elif '• Learning Management System and assessment (Note: Phase 2' not in xml:
            errors.append('LMS Phase 2: bullet not found — check manually')
        else:
            applied.append('✓ LMS Phase 2 note already present')

    # Payroll country exclusions
    payroll_excl = mods.get('payroll_exclude_countries', [])
    if payroll_excl:
        excl_str = ' & '.join(payroll_excl)
        payroll_old = '• Payroll and Compliance </w:t>'
        payroll_new = f'• Payroll and Compliance (Note: Excludes {excl_str} – Payroll module not available for these countries in current scope) </w:t>'
        if payroll_old in xml:
            xml = xml.replace(payroll_old, payroll_new)
            applied.append(f'✓ Payroll exclusion note added for {excl_str}')
        else:
            errors.append(f'Payroll exclusion: bullet not found — check manually')

    # ── 8. Remove ghost bullet paragraphs ────────────────────────────────────
    before = xml.count('<w:p ')
    xml = remove_empty_bullets(xml)
    after = xml.count('<w:p ')
    removed = before - after
    if removed > 0:
        applied.append(f'✓ Removed {removed} ghost bullet paragraph(s)')

    # ── 9. Compliance clause — ensure HK/China in actively-scoped list ───────
    if 'Hong Kong' in payroll_excl or 'China' in payroll_excl:
        # Standard clause already has both; just verify
        if 'Hong Kong' not in xml or 'actively scoped for China, Hong Kong' not in xml:
            # Add Hong Kong to scoped list if missing
            xml = xml.replace(
                'actively scoped for China, Myanmar',
                'actively scoped for China, Hong Kong, Myanmar'
            )
            applied.append('✓ Compliance clause: Hong Kong added to actively-scoped list')
        else:
            applied.append('✓ Compliance clause: Hong Kong already in actively-scoped list')

    # ── 10. Write back ───────────────────────────────────────────────────────
    with open(doc_path, 'w', encoding='utf-8') as f:
        f.write(xml)

    # ── Report ───────────────────────────────────────────────────────────────
    print('\n=== PATCH REPORT ===')
    for line in applied:
        print(line)
    if errors:
        print('\n=== ERRORS (fix manually) ===')
        for e in errors:
            print(f'  ✗ {e}')
    else:
        print('\nAll patches applied successfully.')

    # Mandatory clause check
    if 'Headless API' in xml:
        print('✓ Mandatory: Headless API & Token Usage clause present')
    else:
        print('✗ CRITICAL: Headless API & Token Usage clause MISSING — do not deliver!')

    return len(errors) == 0

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: patch_proposal.py config.json')
        sys.exit(1)
    ok = patch(sys.argv[1])
    sys.exit(0 if ok else 1)
