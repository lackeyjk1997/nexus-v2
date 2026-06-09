---
deal_hubspot_id: seed_deal_001
title: Northpeak Labs — Discovery call (Week 1)
participants:
  - { name: Sarah Chen, role: AE, side: seller, org: Nexus/Anthropic, email: sarah.chen@nexus-demo.com }
  - { name: Maya Johnson, role: Solutions Architect, side: seller, org: Nexus/Anthropic, email: maya.johnson@nexus-demo.com }
  - { name: Diane Okonkwo, role: VP of Engineering, side: buyer, org: Northpeak Labs, email: diane.okonkwo@northpeaklabs.example.com }
  - { name: Raj Mehta, role: Staff ML Engineer, side: buyer, org: Northpeak Labs, email: raj.mehta@northpeaklabs.example.com }
source: simulated
duration_seconds: 2280
recorded_at: 2026-04-09T16:00:00Z
---

[Northpeak Labs — Discovery Call — 38 min]
[Participants: Sarah Chen (AE, Nexus/Anthropic), Maya Johnson (Solutions Architect, Nexus/Anthropic), Diane Okonkwo (VP of Engineering, Northpeak Labs), Raj Mehta (Staff ML Engineer, Northpeak Labs)]

SARAH CHEN: Thanks both for the time. I know eng calendars are brutal right now. Before Maya and I jump into anything — Diane, can you give me the version in your own words? What's the problem you're actually trying to solve this half?

DIANE OKONKWO: Sure. So, context — we build an agent platform, our customers wire up automation agents on top of us, and the engine underneath is, um, it's a big orchestration layer over a couple of foundation models. The problem is reliability. When an agent has to chain six, seven tool calls together, our success rate falls off a cliff. And —

RAJ MEHTA: — it's the long chains specifically. Single shot, fine. It's the multi-step where the model loses the thread, calls the wrong tool, hallucinates an argument —

DIANE OKONKWO: Right. And every time that happens it's a support ticket, it's a churned customer, and honestly it's two of my engineers basically full-time babysitting the orchestration glue instead of building product. That's the thing that's killing me. The headcount cost.

SARAH CHEN: Can you put a number on it? Like volume, or the engineering time?

DIANE OKONKWO: We're doing — Raj, correct me — about four million agent runs a month?

RAJ MEHTA: Four to four and a half, yeah. Growing like fifteen percent month over month. And of the multi-step ones, call it the ones with more than five tool calls, we're seeing — it's not great. I don't want to say the number on a recorded call but it's not great.

DIANE OKONKWO: [laughs] You can say it, Raj.

RAJ MEHTA: It's under seventy percent end-to-end. Which for an automation product that customers are putting in production paths is — yeah.

MAYA JOHNSON: That's really useful, thank you. Can I ask what you're running underneath today? Just so I understand the starting point.

RAJ MEHTA: Mix. We prototyped the whole thing on GPT-4 like eighteen months ago and a lot of the orchestration logic is kind of — it's shaped around that. We've got some open models for the cheap high-volume stuff. But the hard multi-step reasoning is still mostly the, the [inaudible] the OpenAI path.

SARAH CHEN: Got it. And just so I'm not assuming — is this a "we're unhappy and looking" situation, or "we're curious"? No wrong answer, I just want to calibrate.

DIANE OKONKWO: It's — we're looking. I'll be straight with you. The reliability ceiling is a real business problem now, not a someday problem. My CEO has asked me twice this quarter why the agent success rate isn't a board metric yet, and I don't love my answer.

SARAH CHEN: That's helpful to hear, and I appreciate the candor. Maya, do you want to talk about the tool-use reliability piece, since that's —

MAYA JOHNSON: Yeah. So without overselling on a first call — the long-horizon tool-use case is exactly the thing we've spent a lot of cycles on. The honest pitch is: don't take my word for it, let's run your actual hardest chains, the seven-tool-call ones that are failing, and just measure. Side by side. I'd rather lose on your data than win on a slide.

RAJ MEHTA: That I like. Because I've sat through the benchmark decks. Everybody's got a chart where they win. The MMLU-whatever scores are — they don't predict what happens to my agents in prod.

DIANE OKONKWO: Raj has a healthy allergy to benchmark decks.

RAJ MEHTA: [overlapping] — earned allergy —

SARAH CHEN: No, that's — honestly that's the right instinct and it makes our job easier. Let me ask a different angle, Diane. There's a broader thing happening where every software company suddenly has to ship agentic features or look behind. Is some of this pressure coming from your own customers asking for more?

DIANE OKONKWO: A hundred percent. Our customers are getting more ambitious about what they want the agents to do, and the gap between what they want and what we can reliably deliver is widening. So it's not static. The bar is moving up while our success rate sits still. That's the squeeze.

SARAH CHEN: That framing's really clear. Okay. Maya, anything you need to scope a real evaluation?

MAYA JOHNSON: A few things, and we can do this async. A representative set of your failing multi-step traces — even ten or fifteen real ones. What tools they call, the schemas. And whether there's a, a rag retrieval step in the chain, because that changes how we'd —

RAJ MEHTA: There's a retrieval step in most of them, yeah. We can pull traces. Sanitized.

MAYA JOHNSON: Sanitized is perfect. We never need your customers' data to run an eval like this.

DIANE OKONKWO: Okay, that — the sanitized part matters, flag that for later because our security people will care a lot, but let's not go down that hole today.

SARAH CHEN: Noted, and we'll come back to it properly — security's a real conversation, not a checkbox, and I'd rather do it right. For today: who else on your side should be in the room when we look at eval results? I want the right people seeing it the first time, not the fourth.

DIANE OKONKWO: Me, Raj, and probably our CTO, Marcus — different Marcus, ours is Marcus Bell. He'll want to see the methodology before he believes any number. And eventually whoever owns the budget line, but that's me for infrastructure up to a point.

SARAH CHEN: Up to a point — meaning there's a threshold where it goes higher?

DIANE OKONKWO: Anything that becomes a meaningful annual commit, our CFO has a view. But let's get to a number that's worth her time first.

SARAH CHEN: Fair. Last question and then I'll give you your time back — if the eval goes well, what does the next ninety days realistically look like on your end? Just so I'm not inventing a timeline.

DIANE OKONKWO: If the numbers are real? We'd want a paid pilot on one product surface, fast. The thing that would slow us down isn't desire, it's — it's the procurement and the security review, which at our size has gotten heavier than it used to be. But the eng appetite is there today.

SARAH CHEN: Perfect. Then here's what I'd propose: Raj sends sanitized traces, Maya turns around an eval plan, and we get Marcus Bell in the room for the results. That work?

RAJ MEHTA: Works.

DIANE OKONKWO: Works. Thanks, Sarah. This was less painful than most of these.

SARAH CHEN: High praise. Talk soon.

[Call ends]
