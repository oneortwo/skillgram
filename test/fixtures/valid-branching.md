## Steps

### Collect files

Do the work.

### Check totals
After: Collect files
Type: gate
Outcomes: ok, off

Do the work.

### Ask sender
After: Check totals (off)
Type: human gate
Outcomes: fixed, give up

Do the work.

### Stop
After: Ask sender (give up)

Do the work.

### Price
After: Check totals (ok), Ask sender (fixed)
Type: skill
Skill: price-it
Until: the price is rounded

Do the work.

### Archive
After: Collect files

Do the work.

### Report
After: Price, Archive
Join: all

Do the work.

