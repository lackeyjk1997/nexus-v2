---
deal_hubspot_id: seed_deal_001
title: Northpeak Labs — Technical validation / eval readout (Week 4)
participants:
  - { name: Sarah Chen, role: AE, side: seller, org: Nexus/Anthropic, email: sarah.chen@nexus-demo.com }
  - { name: Maya Johnson, role: Solutions Architect, side: seller, org: Nexus/Anthropic, email: maya.johnson@nexus-demo.com }
  - { name: Diane Okonkwo, role: VP of Engineering, side: buyer, org: Northpeak Labs, email: diane.okonkwo@northpeaklabs.example.com }
  - { name: Raj Mehta, role: Staff ML Engineer, side: buyer, org: Northpeak Labs, email: raj.mehta@northpeaklabs.example.com }
source: simulated
duration_seconds: 2640
recorded_at: 2026-04-30T17:00:00Z
---

[Northpeak Labs — Technical Validation / Eval Readout — 44 min]
[Participants: Sarah Chen (AE, Nexus/Anthropic), Maya Johnson (Solutions Architect, Nexus/Anthropic), Diane Okonkwo (VP of Engineering, Northpeak Labs), Raj Mehta (Staff ML Engineer, Northpeak Labs)]

SARAH CHEN: Okay, I think everyone's on. Marcus Bell was going to join — Diane, is he —

DIANE OKONKWO: He's going to drop in late, he's in a board prep thing. Start without him, I'll catch him up. Raj has basically been living in the eval results anyway.

RAJ MEHTA: Can you see my screen? The — yeah. Okay. So. I'm just going to say it: the multi-step numbers are a lot better than I expected. On our seventy-some hardest chains, the seven-plus tool-call ones, we went from sixty-eight percent end to end to — this column here — ninety-one. That's, that's not a marginal thing.

MAYA JOHNSON: And just to be clear for the record, those are your traces, your tools, your schemas. We didn't touch the chains. Same retrieval step.

RAJ MEHTA: Same retrieval step. That's what makes it credible to me. I've been burned by vendor evals that quietly swap out the hard parts. This was our hard parts.

SARAH CHEN: Raj, can I ask — what specifically made you trust this readout versus the benchmark decks you hate?

RAJ MEHTA: Honestly? That you ran it on our failing traces instead of showing me a leaderboard. The whole "lose on your data rather than win on a slide" thing Maya said on the first call — I repeated that line to Marcus, almost verbatim. It reframed the whole evaluation for us. We stopped arguing about benchmarks and started looking at our own failure modes.

DIANE OKONKWO: It genuinely did change the internal conversation. When Raj walked the team through it, it wasn't "which model scores higher," it was "here are our seven worst chains and here's what each option does with them." That's a much better question.

SARAH CHEN: That's — I'm really glad that landed. Maya, anything to add on the where-it-still-breaks?

MAYA JOHNSON: Yes, and I want to be honest about it. There's a cluster of about six chains where we're still only marginally better — they've got a, a really ambiguous tool-selection step where even a human would —

RAJ MEHTA: [overlapping] the routing one, yeah —

MAYA JOHNSON: — the routing one. We're not magic there. I'd rather you know that now than discover it in prod.

DIANE OKONKWO: I appreciate that more than you know. Okay. So I have to be transparent with you both, because you've been transparent with us. We are actively deciding between you and OpenAI. This is a real bake-off, not a formality. Raj ran the same eval set against GPT — the latest one — last week.

SARAH CHEN: I'd assumed as much, and I'd rather talk about it openly. Raj, how'd the comparison shake out, if you can share?

RAJ MEHTA: Close-ish on single-step. On the long multi-step chains you were clearly ahead — the tool-use reliability gap was the thing. Where OpenAI pushed hard was commercials. Their account team came in with a really aggressive multi-year number, like, aggressive enough that our CFO's ears perked up. And they leaned on "you're already built on us, why switch."

DIANE OKONKWO: That last part is the real argument internally. The switching-cost story. We've got eighteen months of orchestration logic shaped around their A P I. So your reliability win has to be big enough to justify the migration, and their price is designed to make us not want to do the math.

SARAH CHEN: That's a completely fair way to frame it, and I'm not going to pretend the migration is free. Here's how I'd think about it — and tell me if this is wrong. The ninety-one versus sixty-eight isn't a vanity number, it's support tickets and churn and the two engineers you said are babysitting glue. If we can quantify what the reliability gap is costing you per month, the question stops being "is switching annoying" and becomes "how long until the switch pays for itself." Would it be useful if Maya helped you build that number with Raj?

DIANE OKONKWO: That — yes. Because right now the price comparison is a spreadsheet and the reliability comparison is a vibe, and the vibe loses to the spreadsheet in a CFO meeting every time. If you give me a defensible cost-of-unreliability number, that's the thing I can actually fight with.

MAYA JOHNSON: I can build that with Raj this week. We've got the run volume, the failure rate delta, your support cost per ticket if you'll share it —

RAJ MEHTA: I'll share it.

[knock / door sound]

DIANE OKONKWO: Marcus, hey — we're on the eval. Short version, the multi-step reliability is real, ninety-one on our hard set, and Sarah's team is going to help us build the cost-of-switching-versus-cost-of-unreliability model so we can take a real recommendation forward.

UNKNOWN SPEAKER: [distorted] — sorry, can you — I just joined, am I — okay. Yeah, I want to see the methodology before I believe ninety-one. But if it holds I'm not religious about the incumbent.

SARAH CHEN: Totally fair, Marcus — we'll send the full methodology doc, nothing hidden. Diane, on next steps — the thing I flagged last time, the security review, I want to start that in parallel and not wait until the commercial conversation closes, because I don't want it to become the thing that slips us. Who owns that on your side?

DIANE OKONKWO: That's a whole conversation. Our security team has gotten strict — we'll need a real session on data handling and retention before anything goes to production. Let me get our security lead on the next call. That one you should not wing.

SARAH CHEN: Agreed, and I won't. Let's make the next one the security and data-governance session, with Maya and our security folks, and we keep the cost-model work going in parallel. Sound right?

DIANE OKONKWO: Sounds right. Good call today. Raj, send Maya the ticket-cost numbers.

RAJ MEHTA: On it.

SARAH CHEN: Thanks all. We'll get the methodology doc over by tomorrow.

[Call ends]
