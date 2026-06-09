---
deal_hubspot_id: seed_deal_003
title: Cedarline Systems — Technical validation / model bake-off (Week 4)
participants:
  - { name: Ryan Foster, role: AE, side: seller, org: Nexus/Anthropic, email: ryan.foster@nexus-demo.com }
  - { name: Maya Johnson, role: Solutions Architect, side: seller, org: Nexus/Anthropic, email: maya.johnson@nexus-demo.com }
  - { name: Mark Feldman, role: SVP Engineering, side: buyer, org: Cedarline Systems, email: mark.feldman@cedarline.example.com }
  - { name: Anika Shah, role: Principal Engineer, side: buyer, org: Cedarline Systems, email: anika.shah@cedarline.example.com }
source: simulated
duration_seconds: 2700
recorded_at: 2026-04-22T16:00:00Z
---

[Cedarline Systems — Technical Validation / Model Bake-off — 45 min]
[Participants: Ryan Foster (AE, Nexus/Anthropic), Maya Johnson (Solutions Architect, Nexus/Anthropic), Mark Feldman (SVP Engineering, Cedarline Systems), Anika Shah (Principal Engineer, Cedarline Systems)]

RYAN FOSTER: Thanks for the time, both. Anika, I know you've been running the comparison heads-down, so I want this to be your call to drive. Mark, I'll make sure we surface anything that needs your decision. Anika, where are we?

ANIKA SHAH: Okay. So I ran a real bake-off. Three way. You, Open AI, and Google — Gemini, through Vertex. I want to give you the honest picture, not the flattering one.

RYAN FOSTER: That's exactly what I want. Please.

ANIKA SHAH: Our workload is the ops-automation reasoning engine — long chains, lots of tool calls against internal systems, and it has to be auditable, every step has to be inspectable. On the core long-horizon reasoning and the tool-use reliability, you were the strongest. Clearly. Gemini was competitive on raw throughput and obviously the Vertex integration is clean for us because we're heavy on Google Cloud already. Open AI was the most familiar to the team and came in cheapest.

MARK FELDMAN: That's the tension in one sentence, right there. The best reasoning is one vendor, the cheapest is another, and the one that's already bundled into infra we pay for is the third.

MAYA JOHNSON: Can I ask which way the reliability gap cut on the auditable-steps requirement specifically? Because that's usually where "competitive on throughput" and "actually usable in an ops system" diverge.

ANIKA SHAH: Good question and that's where it got interesting. The auditability — being able to see and trust the intermediate reasoning steps — that's where you separated from both of them, not just Open AI. Gemini was fast but the chains were harder to make legible. For an ops system where a wrong automated action has real-world consequences, legibility of the steps is non-negotiable for us. So on the dimension I weight highest, you won. But —

MARK FELDMAN: — but the Google relationship is real. We have a large committed cloud spend with them, and our infra team gets pressure to consolidate on Gemini because, on paper, the marginal cost looks near zero against credits we've already committed. Procurement loves that math. I have to be honest that it's a live argument internally.

RYAN FOSTER: I appreciate you naming it — that committed-spend dynamic is something we see a lot, and I won't pretend the credits math isn't attractive. The way I'd frame it, and tell me if it's off: the credits make Gemini look free at the margin, but the thing you said you weight highest — auditable, legible reasoning steps in a system that takes real-world actions — is the thing that's hardest to retrofit if you pick on price and discover the legibility gap in production. Cheap-but-opaque in an ops automation context is its own kind of expensive.

MARK FELDMAN: That's a fair frame. The failure mode I lose sleep over isn't cost, it's an automated action firing wrong because nobody could see the reasoning in time. That's a Cedarline-brand event.

ANIKA SHAH: And just on the Open AI piece — they were cheapest and most familiar, but on our hardest auditable chains they had the same multi-step degradation we already fight. The familiarity argument is real for ramp time but it doesn't solve the actual technical problem. It just means we'd hit the same wall faster.

MAYA JOHNSON: That all tracks. Here's what I'd suggest to make the internal argument concrete rather than a vibes debate: let's quantify the legibility-and-reliability advantage on your specific highest-stakes automation, the one where a wrong action is worst, and put a real number on the risk reduction. And separately I'll get you a clear-eyed total-cost view so the "Gemini is free" framing gets tested against reality including the cost of the legibility gap.

MARK FELDMAN: That's the document I need. Because right now my infra lead has a clean cost slide for Gemini and I have a conviction. Conviction loses to a slide in a procurement review.

RYAN FOSTER: Then let's get you the slide that wins. Mark — what's the decision process from here, realistically, given you're weighing three options at this size?

MARK FELDMAN: I'm the technical decision-maker and the budget sponsor up to the program level. At two million-plus annual, our CFO is directly involved and procurement runs a formal vendor comparison — which means the Gemini credits story will be on the table whether I like it or not. So the timeline is: I need the reliability-and-cost case tight, then it goes through a procurement and finance gate that I do not fully control.

ANIKA SHAH: And I should say, the team's technical recommendation will be you. I'm comfortable saying that. The question isn't engineering, it's whether the commercial and procurement side overrides the technical call.

RYAN FOSTER: That's incredibly helpful to know, Anika, thank you — and it tells me where to put the energy. The technical battle is won; the next battle is commercial and procurement. So I want to bring our deal desk into the next conversation, and given the size, my manager Marcus will join too. Let's make the next one the commercial and procurement working session, with your procurement lead in the room. Who's that?

MARK FELDMAN: Wei Zhang runs procurement on this. I'll bring Wei. And I'll be there because at this number I'm not delegating the negotiation.

RYAN FOSTER: Perfect. Then next session: commercial structure and the total-cost-versus-Gemini reality, with Wei and our deal desk. Maya gets you the risk-reduction quantification on your highest-stakes automation before then. Anything else for today?

ANIKA SHAH: No — well, one. Send me your sustained-throughput numbers at our peak concurrency. If we're going to production scale I need to know the ceiling. I keep asking everyone that and getting hand-waves.

MAYA JOHNSON: You'll get real numbers, not a hand-wave — sustained tokens-per-minute at your concurrency, with the SLA. I'll put it in writing.

RYAN FOSTER: Thanks both. This was a good one — the honesty makes it easy to work.

[Call ends]
