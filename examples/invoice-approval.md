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

### Check the supplier
After: Read the invoice
Until: the supplier's bank details are verified

Compare the bank details with the supplier record. If they changed, call the supplier on the number in the record.

### Match the purchase order
After: Check the supplier
Type: gate
Outcomes: matched, no match

Look the order number up in the purchasing system. Amounts must agree within 1%.

### Ask the requester
After: Match the purchase order (no match)
Type: human

Ask the person who placed the order to confirm the invoice. Wait for their answer.

### Approve
After: Match the purchase order (matched), Ask the requester
Type: human gate
Outcomes: approved, rejected

Send the invoice and the checks to the budget owner for a decision.

### Schedule the payment
After: Approve (approved)
Type: skill
Skill: schedule-payment

Pay on the due date, not before.

### Send it back
After: Approve (rejected)

Reply to the supplier with the reason and ask for a corrected invoice.
