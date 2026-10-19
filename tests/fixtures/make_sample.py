# Writes tests/fixtures/sample-1.x-backup.json: a made-up 1.x household (Alex and Sam) with the same shape as the
# owner's real 1.4 backup, for every test except the golden and update ones. Every name and amount is invented.
# Same shape: the four 1.x accounts, two people's pay keys, 31 bills (one quarterly, one for ten
# months, one yearly with a renewal date; eight with renewal dates; one marked as savings; 13 named so that no category
# is suggested), two other incomes, the three 1.x budgets, two savings transfers, two yearly reminders, October 2026
# saved with typed pay, an overdraft and three ticks (one at £10 under today's amount), and old Wealth data with two
# mortgage deal ends linked to their bills.
# Run from the repo root: python3 tests/fixtures/make_sample.py
import json, os, sys
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sample-1.x-backup.json')
B = lambda i, n, a, acc, months=None, **kw: dict(id=i, name=n, amount=a, account=acc, months=months or [], **kw)
bills = [
  B('b4', 'Water', 48, 'cur1'),
  B('b5', 'Spotify', 11.99, 'cur1'),
  B('b6', 'Kestrel home', 142.18, 'cur1', [12], renews='2026-12-03', lead=30),
  B('b7', 'Life insurance', 21.4, 'cur1'),
  B('b8', 'TCU', 18.5, 'cur1'),
  B('b9', 'Kitty', 27, 'cur1'),
  B('b10', 'Credit card', 150, 'cur1'),
  B('b11', 'Linkway Media', 39.99, 'cur1', renews='2027-08-12', lead=30),
  B('b17', 'Allowance', 24.5, 'cur2'),
  B('b18', 'PSA', 16.25, 'cur2'),
  B('b24', 'TV Licence', 43.64, 'jbills', [2, 5, 8, 11]),
  B('b25', 'Council Tax', 198, 'jbills', [1, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  B('b26', 'Drivebox Sam', 1.99, 'jbills'),
  B('b27', 'Car insurance 1', 31.2, 'jbills', renews='2027-08-14', lead=30),
  B('b28', 'Junior ISA', 50, 'jbills', savings=True),
  B('b29', 'Hearth & Co', 62.5, 'jbills'),
  B('b30', 'Car tax 1', 15.75, 'jbills'),
  B('b31', 'Car tax 2', 21.3, 'jbills'),
  B('b32', 'Leisure Centre', 34, 'jbills', renews='2026-04-12', lead=30),
  B('b33', 'Car insurance 2', 38.9, 'jbills', renews='2027-02-06', lead=30),
  B('b34', 'Lumen', 118.4, 'jbills', renews='2026-12-18', lead=45),
  B('b35', 'Fitzroy', 42, 'jbills', renews='2027-07-09', lead=30),
  B('b36', 'Mortgage 1', 865.2, 'jbills'),
  B('b37', 'Mortgage 2', 96.5, 'jbills'),
  B('b38', 'Amazon Prime', 8.99, 'jbills'),
  B('b39', 'Drivebox Alex', 2.99, 'jbills'),
  B('b40', 'Health cash plan', 18.6, 'jbills', renews='2027-04-03', lead=30),
  B('b41', 'Netflix', 12.99, 'jbills'),
  B('b47', 'Disney+', 9.99, 'jspend'),
  B('b48', 'Kite Alex', 12, 'jspend'),
  B('b49', 'Kite Sam', 8, 'jspend'),
]
config = {
  'bills': bills,
  'income': [{'name': 'Child Benefit', 'amount': 102.4, 'account': 'jbills'}, {'name': 'Grandparent (Junior ISA gift)', 'amount': 25, 'account': 'jspend'}],
  'budget': {'food': 550, 'fuel': 220, 'general': 1010},
  'savings': [{'name': 'Stocks and shares ISA', 'amount': 200, 'account': 'isa', 'id': 'sisa01'},
              {'name': 'Holiday savings', 'amount': 250, 'account': 'holiday', 'id': 'shol01'}],
  'defaultPay': {'alex': 2280, 'sam': 2140},
  'reminders': [{'id': 'rcar1', 'name': 'Car 1 MOT', 'date': '2027-01-09', 'lead': 30, 'yearly': True},
                {'id': 'rcar2', 'name': 'Car 2 MOT', 'date': '2027-03-11', 'lead': 30, 'yearly': True}],
  'doneLog': [], 'payday': {}, 'v12': True, 'schema': 3,
}
wealth = {'accounts': [
  {'id': 'isa', 'name': 'Stocks and shares ISA', 'type': 'isa', 'owner': 'Alex', 'inNW': True, 'contrib': 0},
  {'id': 'pension', 'name': 'Personal pension', 'type': 'sipp', 'owner': 'Alex', 'inNW': True, 'contrib': 0, 'relief': True},
  {'id': 'efund', 'name': 'Emergency fund', 'type': 'cash', 'owner': 'Joint', 'inNW': True, 'emergency': True},
  {'id': 'holiday', 'name': 'Holiday savings', 'type': 'cash', 'owner': 'Joint', 'inNW': True},
  {'id': 'home', 'name': 'Home (estimated value)', 'type': 'property', 'owner': 'Joint', 'inNW': True},
  {'id': 'mort1', 'name': 'Mortgage 1', 'type': 'mortgage', 'owner': 'Joint', 'inNW': True, 'payment': 865.2, 'dealEnd': '2027-09-30', 'lead': 180, 'billId': 'b36'},
  {'id': 'mort2', 'name': 'Mortgage 2', 'type': 'mortgage', 'owner': 'Joint', 'inNW': True, 'payment': 96.5, 'dealEnd': '2028-01-15', 'lead': 180, 'billId': 'b37'},
  {'id': 'card', 'name': 'Credit card', 'type': 'debt', 'owner': 'Alex', 'inNW': True, 'payment': 150, 'billId': 'b10'},
  {'id': 'sofa', 'name': 'Hearth & Co finance', 'type': 'debt', 'owner': 'Joint', 'inNW': True, 'payment': 62.5, 'billId': 'b29'},
  {'id': 'junior', 'name': 'Junior ISA', 'type': 'child', 'owner': 'Child', 'inNW': False, 'contrib': 50}],
  'snaps': {}, 'isaAllowance': 20000, 'isaPrior': {}}
# The saved month: pay typed, an overdraft, and three ticks (filled in by fill_month once the transfers are known).
months = {'2026-10': {'month': '2026-10', 'alex': 2291.46, 'sam': 2128.73, 'overdraft': 95,
  'done': {'sam': 2087.98, 'jbjs': 2535.65, 'sav:sisa01': 200},
  'results': {'sam': 2087.98, 'alex': 1974.58, 'jbillsToJspend': 2545.65, 'float': 215.66}, 'updatedAt': '2026-10-15T12:00:00.000Z'}}
json.dump({'app': 'payday-transfers', 'version': 3, 'savedAt': '2026-10-15T12:00:00.000Z', 'config': config, 'months': months, 'wealth': wealth}, open(out, 'w'), indent=1)
print('wrote', out)

