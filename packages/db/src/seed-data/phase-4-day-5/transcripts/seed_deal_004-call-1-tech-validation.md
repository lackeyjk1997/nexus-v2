---
deal_hubspot_id: seed_deal_004
title: Brightwall — Technical validation (Week 4)
participants:
  - { name: Ryan Foster, role: AE, side: seller, org: Nexus/Anthropic, email: ryan.foster@nexus-demo.com }
  - { name: Maya Johnson, role: Solutions Architect, side: seller, org: Nexus/Anthropic, email: maya.johnson@nexus-demo.com }
  - { name: Jen Alvarez, role: Director of Engineering, side: buyer, org: Brightwall, email: jen.alvarez@brightwall.example.com }
  - { name: Paul Nguyen, role: Senior Software Engineer, side: buyer, org: Brightwall, email: paul.nguyen@brightwall.example.com }
source: simulated
duration_seconds: 2100
recorded_at: 2026-05-26T18:00:00Z
---

[Brightwall — Technical Validation — 35 min]
[Participants: Ryan Foster (AE, Nexus/Anthropic), Maya Johnson (Solutions Architect, Nexus/Anthropic), Jen Alvarez (Director of Engineering, Brightwall), Paul Nguyen (Senior Software Engineer, Brightwall)]

RYAN FOSTER: Thanks both. Jen, Paul — Maya's here for the technical depth. Where I'd love to start: Paul, you've been running the prototype, so tell me what you've actually seen, good and bad.

PAUL NGUYEN: Sure. So context, we're an observability platform, and the feature is — when something breaks at 3am, an engineer should be able to ask "what changed and why is this trace slow" in plain English and get a real answer over the logs and traces. The prototype's been good at the reasoning part. Genuinely good. It correlates across signals in a way our heuristics never did.

JEN ALVAREZ: The demo lands with our own on-call team, which is the bar. They're cynical and they liked it.

RYAN FOSTER: That's the best kind of validation. Paul, you said good and bad — what's the bad?

PAUL NGUYEN: The bad isn't quality, it's — okay, I'm going to be blunt because it's the thing I can't get past. This feature would sit in the hot path during an incident. When a customer's having an outage, that is the exact moment everybody hits our product at once. So I need to know: what happens to throughput when we spike? We cannot have the thing that powers incident response get rate-limited during a launch or a big outage. That's the scenario that scares me, and I keep asking vendors about it and getting hand-waves.

MAYA JOHNSON: That's a completely fair thing to be uncompromising about, and you should not accept a hand-wave. The honest answer is it depends on your committed capacity tier — there's provisioned throughput specifically so you're not competing in a shared pool during a spike. I'd rather show you the actual sustained tokens-per-minute number for a tier sized to your peak concurrency and put an S-L-A next to it in writing than tell you "it'll be fine."

PAUL NGUYEN: That — yes. A real number and an SLA. If you give me that, you'd be the first.

JEN ALVAREZ: And I'll add the commercial context, because I have to. We're also evaluating Open AI for this. Their model was strong too, honestly comparable on the reasoning for our use case, and their price came in lower and our team already knows their A P I. So the reasoning quality alone isn't going to be the whole decision for me — it's reasoning plus the reliability-under-load Paul's worried about plus cost.

RYAN FOSTER: I appreciate you putting the whole picture on the table. Let me make sure I understand the weighting — if Open AI is comparable on reasoning and cheaper, then the deciding factors are really the reliability-under-load and the support model during an incident?

JEN ALVAREZ: That's right. If you're meaningfully more reliable when it matters most — during a customer incident — that's worth a price premium to me, because our whole brand is being the tool you trust when things are on fire. But "meaningfully more reliable" has to be a number, not a claim. If it's a wash on reliability, then honestly the cheaper familiar option is hard to argue against.

PAUL NGUYEN: There's also a broader thing — every observability vendor is bolting on an AI incident-assistant right now. So the table stakes are rising fast. The ones that'll win aren't the ones that have it, it's the ones whose version doesn't fall over exactly when the customer needs it.

MAYA JOHNSON: Then the eval should be designed around your worst moment, not your average one. Here's what I'd propose: we load-test the assistant at your modeled peak-incident concurrency, measure sustained throughput and latency under that spike, and you see the provisioned-tier behavior directly. Same workload, and you can run it against the other option too — I'd rather you compare reliability-under-load head to head than take my word.

JEN ALVAREZ: That's the eval that would actually decide it for me. Reliability under our worst-case load, measured, both options.

RYAN FOSTER: Then let's scope exactly that. Jen, on the decision — beyond you and Paul, who else weighs in, and what's the timeline?

JEN ALVAREZ: It's my call on the engineering side. I'd loop our VP of Product because it's a customer-facing feature, and finance for the spend, but I drive it. Timeline — we want to commit to a direction this quarter so we can ship in the fall. The load-test result is the gating input.

RYAN FOSTER: Good. So next step is the peak-concurrency load test with the provisioned tier, Maya gets Paul the throughput numbers and SLA in writing beforehand so he's not flying blind, and you run it head to head. Anything else?

PAUL NGUYEN: Just — send the throughput number before the test so I can sanity-check the tier sizing against our actual incident traffic. I don't want to discover mid-test that the tier's wrong.

MAYA JOHNSON: You'll have it first — tier sizing against your peak, with the numbers, before we test. Not after.

JEN ALVAREZ: Then we're set. Thanks Ryan, this was concrete, which I appreciate.

RYAN FOSTER: That's the goal. We'll get the throughput specs over this week.

[Call ends]
