---
deal_hubspot_id: seed_deal_002
title: Slate Data — Technical validation / eval readout (Week 4)
participants:
  - { name: Sarah Chen, role: AE, side: seller, org: Nexus/Anthropic, email: sarah.chen@nexus-demo.com }
  - { name: Maya Johnson, role: Solutions Architect, side: seller, org: Nexus/Anthropic, email: maya.johnson@nexus-demo.com }
  - { name: Kevin Liu, role: CTO, side: buyer, org: Slate Data, email: kevin.liu@slatedata.example.com }
  - { name: Sofia Reyes, role: Engineering Manager (Platform), side: buyer, org: Slate Data, email: sofia.reyes@slatedata.example.com }
source: simulated
duration_seconds: 2280
recorded_at: 2026-05-19T17:30:00Z
---

[Slate Data — Technical Validation / Eval Readout — 38 min]
[Participants: Sarah Chen (AE, Nexus/Anthropic), Maya Johnson (Solutions Architect, Nexus/Anthropic), Kevin Liu (CTO, Slate Data), Sofia Reyes (Engineering Manager, Slate Data)]

SARAH CHEN: Thanks both. Maya and Sofia have been deep in the eval results, so I'll mostly listen. Sofia, do you want to set it up?

SOFIA REYES: Yeah. So the headline that matters to Kevin — the abstention behavior. On our failure set, the questions where v1 used to confidently return a wrong number, the new setup correctly said "I can't answer this reliably" or asked a clarifying question about eighty-eight percent of the time, instead of inventing a column. And when it did answer, accuracy on the hard multi-join questions was way up.

KEVIN LIU: Say the column-hallucination number, because that's the one I wrote down last time.

SOFIA REYES: Column hallucination went from — it was almost one in five on the gnarly schemas — down to low single digits. And the ones it got wrong, it mostly flagged as low-confidence rather than asserting them.

KEVIN LIU: That — okay. That's the behavior I needed to see. An analyst can work with "I'm not sure, here's my best guess, verify this." An analyst cannot work with a confident wrong number. That distinction is the whole product.

MAYA JOHNSON: And I'll be straight about the limits — there's a class of questions involving your customers' custom metric definitions where we just don't have the context to be right, and there we lean hard on abstention. That's correct behavior but it means the feature needs a way for customers to teach it their definitions over time. That's a real design implication, not a model setting.

KEVIN LIU: No, that's — that's honest and it's right. Okay. I'm going to be transparent the way you've been. We also ran a parallel eval against OpenAI's latest. I'd be a bad CTO if I didn't.

SARAH CHEN: Of course — I'd expect nothing less. How'd it look?

KEVIN LIU: On raw S-Q-L generation, genuinely close, I won't pretend otherwise. Where you separated was the abstention discipline and the long-context reasoning over the full eight-hundred-table schema — you held context better and you guessed less. OpenAI's team, meanwhile, came back hard on price and on "everyone already knows our A P I, your engineers won't need to ramp." The familiarity argument.

SOFIA REYES: Which, for the record, my engineers found the integration about equally easy, so that argument didn't really land with the people doing the work. It landed more with finance.

KEVIN LIU: [laughs] Finance likes the familiar cheaper thing, yes. But I'm the one who owns the brand risk of a wrong number, and the abstention gap is worth real money to me. So you're ahead on the thing I weight most. I want to say that clearly.

SARAH CHEN: I appreciate you saying it, and I'll help you arm the finance conversation — if the abstention discipline prevents even a couple of "wrong board number" incidents with your top accounts, that's the ROI story, not per-token price. Maya can help Sofia frame that.

KEVIN LIU: Yes. But Sarah, I have to flag the real blocker, and it's not the model. It's our review process. To run even a pilot, we'd be sending portions of our customers' warehouse data — or schema and sample rows — to your A P I. Our security and legal will not let that happen until the data-processing terms are signed and reviewed. And that review queue right now is about six weeks. That is the gate. Until legal clears the data handling, we cannot start, no matter how good the eval is.

SOFIA REYES: It's true. I've watched two other tools die in that queue, not because they were bad but because they couldn't get clean answers to the data questions fast enough and legal lost patience.

SARAH CHEN: Then let me treat that as the priority, not an afterthought. Here's what I'd propose — and tell me if it helps. We get your legal and security team the full package now, in parallel with the finance conversation: our standard data-processing addendum with a zero-retention and no-training commitment, the SOC 2 report, sub-processor list, residency options. If the long pole is legal review, the worst thing we can do is feed them documents one at a time.

KEVIN LIU: That genuinely helps. Half of why the queue is six weeks is documents arriving piecemeal and legal re-opening the file each time. If you give me one complete package I can hand it over as a single review item.

MAYA JOHNSON: I'll assemble it. The zero-retention-and-no-training-on-your-data piece specifically is the thing your legal will want to see in the actual terms — and it's there, contractually, not just policy.

KEVIN LIU: That's exactly what the prior two tools couldn't give me cleanly. If that's contractual, you're already past where they failed.

SARAH CHEN: Then the package is the critical path. Kevin, once legal clears, who signs and is there a finance gate?

KEVIN LIU: I sponsor, legal clears the terms, and at this annual number our CEO co-signs with finance's nod. The finance nod is where the OpenAI price delta will come up, so Sofia and I will have the abstention-ROI story ready for it.

SARAH CHEN: Good. So: Maya assembles the legal-and-security package this week and we get it into your review queue immediately, you and Sofia build the abstention-ROI framing for finance, and we keep the eval momentum. Anything I'm missing?

SOFIA REYES: Just — actually send the data-processing terms to me first so I can route them to the right legal person. Last time a vendor sent it to the wrong inbox and lost a week.

SARAH CHEN: Will do — straight to you, Sofia. Thanks both, this is in good shape.

[Call ends]
