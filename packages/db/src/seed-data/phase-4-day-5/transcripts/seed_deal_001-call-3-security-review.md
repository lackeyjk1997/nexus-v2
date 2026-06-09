---
deal_hubspot_id: seed_deal_001
title: Northpeak Labs — Security & data-governance review (Week 7)
participants:
  - { name: Sarah Chen, role: AE, side: seller, org: Nexus/Anthropic, email: sarah.chen@nexus-demo.com }
  - { name: Maya Johnson, role: Solutions Architect, side: seller, org: Nexus/Anthropic, email: maya.johnson@nexus-demo.com }
  - { name: Diane Okonkwo, role: VP of Engineering, side: buyer, org: Northpeak Labs, email: diane.okonkwo@northpeaklabs.example.com }
  - { name: Priya Anand, role: Head of Security, side: buyer, org: Northpeak Labs, email: priya.anand@northpeaklabs.example.com }
  - { name: Tom Bradley, role: Director of Procurement, side: buyer, org: Northpeak Labs, email: tom.bradley@northpeaklabs.example.com }
source: simulated
duration_seconds: 2520
recorded_at: 2026-05-21T15:30:00Z
---

[Northpeak Labs — Security & Data-Governance Review — 42 min]
[Participants: Sarah Chen (AE, Nexus/Anthropic), Maya Johnson (Solutions Architect, Nexus/Anthropic), Diane Okonkwo (VP of Engineering, Northpeak Labs), Priya Anand (Head of Security, Northpeak Labs), Tom Bradley (Director of Procurement, Northpeak Labs)]

SARAH CHEN: Thanks everyone. Priya, Tom — first time on a call with you both, so quick framing: the goal today is to surface every security and contracting concern now, not at the finish line. Maya's going to walk the data-handling architecture, and I want Priya driving the questions. Priya, where do you want to start?

PRIYA ANAND: I'll start with the thing that's a gate for me, so we don't waste forty minutes. We are putting this in a production path that touches customer data. I need a contractual guarantee — in the agreement, not on a webpage — that prompt and completion data is not retained and not used for training. If I can't get zero data retention in writing, this does not get my sign-off for production. Full stop. That's the blocker.

MAYA JOHNSON: That's exactly the right place to start, and the answer is yes — zero retention and no training on your data is available as a contractual commitment in the enterprise agreement, not just a policy page. I'll walk you through the data flow so you can see where it would and wouldn't persist.

PRIYA ANAND: Good. Because I'll be honest, the reason I'm leading with it — the other vendor, the OpenAI conversation, stalled right here. Their default terms and what my team needed were not the same thing, and getting a straight answer on retention took three weeks and two legal rounds. I do not want a repeat.

DIANE OKONKWO: That's the real story of why we're behind on the timeline, by the way. It wasn't the eval. It was six weeks lost in a retention back-and-forth with the incumbent.

SARAH CHEN: That's useful context, and it's exactly why I pushed to start this in parallel last call instead of waiting. Maya, walk the architecture.

MAYA JOHNSON: So — at a high level. Requests go to the A P I over the customer's own keys. For an enterprise tenant with zero-retention enabled, the request and response aren't written to persistent storage after the completion returns. There's no — [crosstalk] —

PRIYA ANAND: [overlapping] — what about abuse monitoring, because everyone says zero retention and then there's an asterisk for safety logging —

MAYA JOHNSON: — that's a fair and specific question. There's a zero-retention configuration where even the safety-systems logging is not retained, for qualified enterprise use cases. That's a conversation we have to have explicitly with your tenant, and I'd rather over-document it than hand-wave it. I'll bring the exact data-flow diagram and the retention addendum language to legal.

PRIYA ANAND: That's the answer I needed and didn't get from the other side. Okay. Next: SOC 2. Do you have a current Type 2, soc two, report and will you sign our security addendum?

SARAH CHEN: Yes on the SOC 2 Type 2 — we can get the current report under N-D-A this week. The security addendum we'll need legal to review but there's nothing you've said so far that sounds out of bounds.

PRIYA ANAND: And sub-processors? I need the list. And data residency — where does inference physically happen, because we've got some EU customers and that —

MAYA JOHNSON: We have a documented sub-processor list and there are regional options for where inference runs. EU data residency is supportable; let me get you the specifics in writing rather than approximate it on a call.

PRIYA ANAND: If all of that holds up in the documents, then my gate clears. I want to be clear — I'm not a no. I'm a "not without the retention language signed," and it sounds like that exists, which already puts you ahead of where the other conversation got.

SARAH CHEN: I really appreciate you naming the gate so directly. Tom, let me bring you in — on the contracting and timeline side, what does this look like from procurement?

TOM BRADLEY: So the honest version is our M-S-A review queue is the long pole. Legal is backed up — any new vendor agreement is running about a four to six week review right now regardless of how clean it is. If there's a data-processing addendum and a security addendum riding along, those get reviewed too. So even if Priya clears today, you're not signed next week.

DIANE OKONKWO: This is the thing I keep flagging internally. The product decision is basically made on my side. The schedule risk is entirely in legal and security review now, not in whether the technology works.

SARAH CHEN: Then let me try to take time out of that. Tom, if we get you the SOC 2 report, the sub-processor list, the standard D-P-A with the zero-retention addendum, and our paper for the security addendum all in one package this week — does that compress the queue at all, or is four to six weeks just four to six weeks?

TOM BRADLEY: Getting it all at once genuinely helps — half the delay is usually waiting on documents to trickle in one at a time. It won't get us to next week, but it could be the difference between four weeks and eight. Send it as one package and I'll personally walk it into legal.

SARAH CHEN: Then that's the plan, and I'll own assembling the package. Tom, who signs on your side once legal clears — is there a dollar threshold where it goes up to your CFO?

TOM BRADLEY: Anything at this annual level goes to our CFO for final signature, yes. Diane sponsors it, but the CFO signs. So you'll want Diane's business case tight, because the CFO's first question will be "why switch from what we have."

DIANE OKONKWO: Which is exactly the cost-of-unreliability model Maya and Raj are building. That's the document that answers the CFO. Good — it's all connecting.

SARAH CHEN: Okay. So: I assemble the security and contracting package this week, Maya gets Priya the retention addendum, data-flow diagram, sub-processor list, and residency specifics, and Diane and Raj finish the cost model for the CFO. Priya, anything we haven't asked that we should have?

PRIYA ANAND: One. When there's an incident — yours, not ours — what's the notification S-L-A and is it contractual. Send me that too.

MAYA JOHNSON: Added to the package. Contractual breach-notification terms, you'll have them.

SARAH CHEN: Thank you all — this was the call I most wanted to go well, and it did. We'll have the package over by Friday.

TOM BRADLEY: Appreciate it. Send it as one package, remember.

[Call ends]
