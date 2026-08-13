# SignalScout — how it works (plain English)

No code in this document. If you sell things for a living, this is the whole system.

---

## The problem with signal feeds

You have probably seen a tool that says *"Acme just raised a Series B — reach out!"*
That is a feed: a list of things that happened, newest first.

A feed cannot answer the question you actually have on Monday morning, which is
**who should I contact today**. Four reasons.

**1. The feed does not forget.** A round from February is still sitting there in
October, styled exactly like something that happened yesterday. But the entire
reason a funding round is worth knowing is that money just landed and gets spent
over the next couple of quarters. Six months later, the budget has an owner and a
roadmap. The freshness *was* the signal, and the feed threw it away.

**2. Whoever publishes most wins.** A company that ships four product updates and
rewrites its homepage looks busier than a company that hired a CTO and raised
money. If your score is a running total, the loudest marketing team floats to the
top of your call list.

**3. Fit and timing get mashed into one number.** Suppose two accounts both score
60. One is a perfect customer where nothing is happening. The other is on fire but
you could never sell to them. Same number, opposite instructions. You now have a
score you cannot act on.

**4. The events are handed to you already labelled.** Somebody else decided that
this was "a funding round". You never see the working.

---

## What this tool does instead

It starts one step earlier. Instead of events, it takes **observations**: what a
crawler could plausibly have seen about a company on a given day.

> On 10 July, Cobalt Ledger had 74 staff, was at seed stage with $4.5M raised,
> used Warehowse and Modelform, had a CTO and a VP Finance, and its homepage said
> "Ledgers for embedded finance".

That is it. No events, no labels, nothing interpreted. Just a snapshot, plus any
job posts and product releases seen since the last look.

Then it looks at the *next* snapshot and compares.

> On 12 June, the same company was at Series A with $26M raised, and 88 staff.

Nobody told the tool that a funding round happened. It worked that out, because
the stage moved and the total went up. **Every event on the board is derived this
way.** That is the point of the whole project, and you can check any of it.

---

## Signals lose value as they age

Each signal starts at a weight — a funding round is worth 25 points, a new
engineering leader 22, a product launch 8 — and then it decays.

The rate is set by a **half-life**, which is just "how long until it is worth
half as much":

| Kind of signal | Half-life | Why that number |
|---|---|---|
| Money — funding | 60 days | Budget lands, then gets spent over two quarters |
| People — a leader arrives or leaves | 45 days | New execs rebuild their stack in their first 90 days |
| Growth — hiring, headcount | 30 days | Hiring intent goes cold fast |
| Technology — tools in and out of the stack | 30 days | The window closes when they pick a replacement |
| Market — launches, repositioning | 21 days | A launch is news for about three weeks |

So Cobalt Ledger's round, 89 days old, is past one half-life and a bit:

> 25 points × ½^(89 ÷ 60) = **9 points**

That is the number on the board. You can do it on a phone calculator, and the app
prints the sum next to the row so you can.

Past **four half-lives** the signal is dropped entirely rather than shown as a
1-point ghost. A funding round stops counting after 240 days. A product launch
stops counting after 84.

---

## The one clever bit: two different clocks

Here is the distinction that makes the ageing believable.

**A funding round happened once.** It closed on some day, and every day after that
it is older. Nothing can make it fresh again.

**A hiring surge is still happening.** If a company posted four engineering roles
in June and is *still posting them* in August, that is not an old signal — it is an
ongoing one. Its freshness is its most recent evidence, not its first.

So the two are aged from different dates:

- **State changes** (headcount, funding, execs, tools, positioning) age from
  **when they changed**.
- **Arrivals** (job posts, releases) age from **the newest piece of evidence**.

One sentence of difference, and it is why a hiring surge can sit near the top of
the board for two months while a round from the same week fades away underneath it.

An ongoing surge does go cold — but only when the posting actually stops. Once the
company drops below its own threshold (say, four posts in 45 days), the surge stops
being refreshed and starts ageing from its last real evidence.

---

## Never claiming something is fresher than it is

Crawlers miss things. One account in the demo data was seen on 15 May and then not
again until 12 August — an 89-day hole. When it reappeared, it had raised a round.

When did that happen? **Nobody knows.** Somewhere in those 89 days.

The tool assumes the **earliest** possible date, so the signal is treated as 89
days old and already half-decayed. The row says so: *"dated conservatively inside
an 89-day window"*.

That is the deliberate direction to be wrong in. A timing tool that guesses
"probably last week" will eventually tell you to call someone about something that
happened three months ago, and that is the one mistake that makes a rep stop
trusting the tool. Being slightly too pessimistic costs you nothing; being
optimistic costs you your credibility.

---

## Why loud companies do not take over the board

Two rules stop volume beating substance.

**Diminishing returns.** Within a family, the biggest signal counts fully, the
second counts half, the third a quarter, and so on. Four product launches are worth
8 + 4 + 2 + 1, not 32.

**A ceiling per family.** Each family can only ever contribute so much: Money 25,
People 25, Growth 20, Technology 20, Market 10. In the demo there is a company that
shipped five things in five weeks; its Market score hits the ceiling of 10 and the
rest is listed as *clipped by the family cap*. It sits mid-board, which is where a
company whose only news is its own announcements belongs.

Add those five ceilings up and you get 100, which is why a score is out of 100
without any rescaling. Nothing in the scoring does any division at all — which
means there is no way for the maths to produce a nonsense number.

**Reaching 100 is effectively impossible**, and that is fine. It would need every
family firing at full strength on the same day. The best account on a healthy board
sits around 30.

---

## Bad news counts against you

Most signal tools only know good news, which makes them hype meters. Two of the ten
signals here are negative:

- **Headcount contraction** — a company shedding staff
- **A competitor entering the stack** — someone else just won

And negatives get **no** diminishing returns. A second round of layoffs is not less
bad than the first, so it counts in full.

The scale goes down to **−25**, not to zero. This matters: an account that just cut
30% of its staff should rank *below* an account where nothing at all has happened,
and a scale that stops at zero cannot say that. In the demo, a very strong-fit
retailer sits at −12, well beneath a dozen accounts nobody has any news about.

---

## Fit and timing stay separate

Every account also carries an **ICP fit** score, which arrives as data — it comes
from a different tool (Day 001 of this challenge) and this one never recalculates
it or blends it in.

That refusal is deliberate. Multiply fit by timing and you get a number that cannot
tell these two situations apart:

- Perfect customer, nothing happening → **worth a note in the calendar**
- Lots happening, company you can never sell to → **worth nothing at all**

So they stay on two axes, and the second tab of the app plots them:

|  | **Quiet** | **Loud** |
|---|---|---|
| **Good fit** | Nurture | **Act now** |
| **Poor fit** | Ignore | Loud, wrong company |

The bottom-right box is the argument. In the demo it contains a robotics company
with plenty of signal and mediocre fit. On a blended score it would look like a
priority. Here it is visibly the wrong company having an interesting month.

One override: an account going backwards is never a nurture candidate however well
it fits, so contracting accounts sort to the top of their box with a red tag.

---

## Six states, and why two of them look the same but are not

Each account gets a label worked out from how its score has moved:

- **Rising** — worth more than it was two weeks ago
- **Cooling** — still active, but fading
- **Steady** — unchanged
- **Contracting** — net negative; going the wrong way
- **Stale** — had signals once, all of them now too old to count
- **Quiet** — nothing has ever fired, in the whole period watched

**Stale and Quiet are different situations and most tools show both as an empty
row.** "This went cold four months ago" is a lapsed opportunity — something
happened and you missed it. "We have watched since February and nothing has ever
happened" is a company to keep an eye on. Opposite actions, so they get opposite
labels.

---

## Dragging the date

The slider along the top sets the day you are asking about, and everything is
recalculated from scratch for that day. Drag it back to June and the board is
genuinely the board as it would have looked in June — not a filter, a
recalculation.

This is the fastest way to see the whole model at once. Watch a funding round fire
at full weight, halve, and disappear. Watch a hiring surge stay hot while
everything around it fades. Watch the order change.

The maths runs in your browser, which is why it keeps up with your finger.

---

## What the tool refuses to do

**The AI never touches a score.** There is an optional box where you can type
*"we sell observability to Series B data teams, I care most when they lose an
engineering leader or drop a competitor"*, and a language model turns that into
settings — which families matter, which tools are competitors, which job functions
you sell to. Those settings appear in the panel for you to check and change.

That is all it does. It configures the ruler; it never does the measuring. Every
number on the board is arithmetic over data you can see. If a model were deciding
which news items counted, you would have to take the board on trust, and the one
thing this project is trying to demonstrate is that you do not have to.

**It does not guess at job titles it does not recognise.** A post it cannot place
is reported as unplaced rather than filed under Engineering, because a wrong guess
quietly inflates the score of every account that posts unusual titles.

**It does not invent dates**, as above.

**It shows its rejects.** Every account lists what was considered and thrown out,
with the reason: too old, clipped by a ceiling, or a competitor leaving the stack
that turned out to be a tool you partner with rather than compete against. A tool
that only shows you its conclusions is asking for more trust than it has earned.

---

## The data

40 companies, invented. Every web address ends in `.example`, which is a reserved
suffix that can never be a real site, and every tool name is made up. Publishing
plausible-looking headcounts and funding figures attached to real company names
would be worse than clearly-labelled fiction.

The distribution is designed rather than random. Ten of the accounts exist to make
one specific rule visible: the loud one that gets capped, the perfect-fit silent
one, the strong-fit one that is shrinking, the one with the 89-day hole, the one
first seen halfway through, and a pair that are identical except that one dropped a
competitor and the other picked one up.

That last pair is the neatest demonstration in the product. Same company, same day,
same change: the one that dropped the competitor gains **22 points**, the one that
picked it up loses **14**. The gap is not a bug — a displacement window opening is
worth more to you than a competitor's win costs you, because one is an opportunity
you can act on this week and the other is a fact you have to live with.

---

Day 005 of a 100-day build challenge. Synthetic data throughout.
