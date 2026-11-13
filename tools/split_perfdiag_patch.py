"""[PERFDIAG] Split a unified git diff into diag (all +/- lines carry PerfDiag/PERFDIAG) and user parts."""
import re, sys

full, diag_out, user_out = sys.argv[1], sys.argv[2], sys.argv[3]
with open(full, encoding="utf-8", errors="surrogateescape", newline="") as f:
    lines = f.readlines()

MARK = re.compile(r"PerfDiag|PERFDIAG")
files = []  # (header_lines, [hunk_lines,...])
cur_header, cur_hunks = [], []
i = 0
while i < len(lines):
    l = lines[i]
    if l.startswith("diff --git"):
        if cur_header:
            files.append((cur_header, cur_hunks))
        cur_header, cur_hunks = [l], []
        i += 1
        while i < len(lines) and not lines[i].startswith("@@"):
            cur_header.append(lines[i]); i += 1
        continue
    if l.startswith("@@"):
        hunk = [l]; i += 1
        while i < len(lines) and not lines[i].startswith("diff --git") and not lines[i].startswith("@@"):
            hunk.append(lines[i]); i += 1
        cur_hunks.append(hunk)
        continue
    i += 1
if cur_header:
    files.append((cur_header, cur_hunks))

diag, user, mixed = [], [], []
for header, hunks in files:
    d_hunks, u_hunks = [], []
    for h in hunks:
        added = [x for x in h if x.startswith("+") and not x.startswith("+++")]
        if not added:
            continue
        if all(MARK.search(x) for x in added):
            d_hunks.append(h)
        elif not any(MARK.search(x) for x in added):
            u_hunks.append(h)
        else:
            mixed.append((header[0].strip(), h[0].strip()))
    for dst, hs in ((diag, d_hunks), (user, u_hunks)):
        if hs:
            dst.extend(header)
            for h in hs:
                dst.extend(h)

for name, data in ((diag_out, diag), (user_out, user)):
    with open(name, "w", encoding="utf-8", errors="surrogateescape", newline="") as f:
        f.write("".join(data))
print(f"diag hunks: {sum(len(h) and 1 for h in diag if h[0].startswith('@@'))}")
print(f"user hunks: {sum(len(h) and 1 for h in user if h[0].startswith('@@'))}")
if mixed:
    print("MIXED HUNKS (need manual split):")
    for fn, hh in mixed:
        print(" ", fn, hh)
