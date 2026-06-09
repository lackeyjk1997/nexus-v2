---
deal_hubspot_id: seed_deal_002
title: Slate Data — Discovery call (Week 1)
participants:
  - { name: Sarah Chen, role: AE, side: seller, org: Nexus/Anthropic, email: sarah.chen@nexus-demo.com }
  - { name: Maya Johnson, role: Solutions Architect, side: seller, org: Nexus/Anthropic, email: maya.johnson@nexus-demo.com }
  - { name: Kevin Liu, role: CTO, side: buyer, org: Slate Data, email: kevin.liu@slatedata.example.com }
  - { name: Sofia Reyes, role: Engineering Manager (Platform), side: buyer, org: Slate Data, email: sofia.reyes@slatedata.example.com }
source: simulated
duration_seconds: 1980
recorded_at: 2026-04-27T18:00:00Z
---

[Slate Data — Discovery Call — 33 min]
[Participants: Sarah Chen (AE, Nexus/Anthropic), Maya Johnson (Solutions Architect, Nexus/Anthropic), Kevin Liu (CTO, Slate Data), Sofia Reyes (Engineering Manager, Slate Data)]

SOFIA REYES: Hey Sarah, hi Maya. I pulled Kevin in because — well, I'm the one who reached out, but he's the one who has to bless any model spend, so.

KEVIN LIU: That's an accurate description of my job, yes. [laughs] Hi.

SARAH CHEN: Perfect, glad you're both here. Sofia, since you raised your hand — what's the thing you're trying to build?

SOFIA REYES: So we're a data infrastructure company, our customers point us at their warehouses and we do the pipeline and analytics layer. And for about a year now the number one ask from our enterprise accounts is some version of "let me just ask my data a question in English." A natural-language-to-query thing. An analytics copilot, basically.

SARAH CHEN: And you've started building it?

SOFIA REYES: We have a v1. And it — okay, it demos well and it falls apart in the field. The natural language to S-Q-L is fine on toy schemas. On a real customer warehouse with eight hundred tables and inconsistent naming, it hallucinates columns that don't exist, it writes joins that are subtly wrong, and a wrong number that looks right is so much worse than no answer in analytics. That's the nightmare.

KEVIN LIU: That's the part that keeps me up. We're a data company. If our AI feature confidently returns a wrong revenue number to a customer's exec, that's not a bug, that's an existential brand problem. I would almost rather not ship it than ship it wrong.

MAYA JOHNSON: That's a really mature way to hold it, honestly. Can I ask what the v1 is running on under the hood?

SOFIA REYES: GPT-4 class, through the A P I. We — yeah. It was the fastest thing to prototype on a year ago.

KEVIN LIU: And to be fair it's not that the model is bad. It's that the hard part is grounding it in a specific messy schema and getting it to say "I'm not sure" instead of inventing a column. The reliability of the structured output and the long-context reasoning over a big schema is where we keep hitting a wall.

SARAH CHEN: Can you give me a sense of scale? Like how many customers want this, and what it's worth to you?

SOFIA REYES: Of our enterprise tier, I'd say a third have explicitly asked, and a couple have made it a renewal condition. Kevin, the —

KEVIN LIU: Two of our top fifteen accounts have basically said "we want this on the roadmap or we re-evaluate at renewal." So it's not a nice-to-have feature, it's tied to retention now. We've got about forty people on the data platform team and a chunk of them are stuck on this problem instead of core pipeline work.

SARAH CHEN: That's a clear stake. Maya, the schema-grounding and the structured-output reliability — is that a real evaluation we can run?

MAYA JOHNSON: Very much so, and it's the right way to find out rather than me asserting it. The thing I'd want: one of your genuinely messy real schemas, sanitized, and a set of the questions where v1 currently produces wrong-but-confident answers. Those failure cases are gold. We run them and you see exactly where the column-hallucination rate lands and how often it correctly abstains.

SOFIA REYES: I can get a sanitized schema and a failure set. The abstention thing — "correctly says I don't know" — if you can show me that number specifically, that's what Kevin will care about.

KEVIN LIU: That is the number I care about. Accuracy when it answers, and how often it has the sense to not answer. Give me those two and I can reason about it.

SARAH CHEN: We'll get you both. There's a broader thing I'll name — every analytics and data vendor is racing to ship some version of this copilot right now, so the pressure you're feeling from customers is industry-wide, not just you. Which cuts both ways: it's urgent, but it also means the bar for "actually trustworthy" is what'll differentiate you, not just "has an AI feature."

KEVIN LIU: That's exactly our bet. Everyone will have a demo. Few will have one that an analyst actually trusts with a board number. We want to be the trustworthy one. That's the whole strategy.

SARAH CHEN: Then the eval should speak directly to that. Last thing for today — if the numbers are good, who else is part of this decision, and what's the rough timeline?

KEVIN LIU: Decision's mostly me on the technology, with Sofia owning the implementation. Spend at this level, I loop in our CEO and finance but I'm not going to pretend that's a hard gate — if the tech is right and the customer-retention story is there, we move. The thing that'll actually slow us is our own legal and security review on sending customer data to a model provider. That's gotten genuinely heavy. But that's a later conversation.

SARAH CHEN: It is, and we'll give it real time when we get there — it's never a checkbox. For now: Sofia sends a sanitized schema and the failure set, Maya runs the grounding-and-abstention eval, and we get back together to look at real numbers. Good?

SOFIA REYES: Good. I'll get that over this week.

KEVIN LIU: Thanks Sarah. Make the abstention number honest and you'll have my attention.

SARAH CHEN: Honest is the only way it's useful. Talk soon.

[Call ends]
