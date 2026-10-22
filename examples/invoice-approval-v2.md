---
name: invoice-approval
description: Check an incoming supplier invoice, get it approved and schedule the payment.
metadata:
  skillgram: "0.1"
---

# Invoice approval

Takes an invoice that arrived by email and gets it paid, or sends it back.

## Steps

### Read the invoice
Pull the PDF from the email. Extract supplier, amount, currency, due date and purchase order number.

### Match the purchase order
After: Read the invoice
Type: gate
Outcomes: matched, no match

Look the order number up in the purchasing system. Amounts must agree within 1%.

### Ask the requester
After: Match the purchase order (no match)
Type: human gate
Outcomes: confirmed, disputed

Ask the person who placed the order to confirm the invoice. Wait for their answer.

### Approve
After: Match the purchase order (matched), Ask the requester (confirmed)
Type: human gate
Outcomes: approved, rejected

Send the invoice and the checks to the budget owner for a decision.

### Pay the invoice
After: Approve (approved)
Type: skill
Skill: schedule-payment

Pay on the due date, not before.

### Send it back
After: Approve (rejected), Ask the requester (disputed)

Reply to the supplier with the reason and ask for a corrected invoice.

### Notify the requester
After: Pay the invoice

Tell the requester the invoice was paid.
