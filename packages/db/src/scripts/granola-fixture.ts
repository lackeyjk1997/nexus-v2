/**
 * Synthetic interview fixture in the EXACT Granola payload shape
 * (channel-level speakers: microphone = seller/Jeff, speaker =
 * buyer/Ernesto). Shared by dryrun-granola-fitness (synthetic deal) and
 * granola-demo-ops fallback (pinned demo deal).
 */
import type { GranolaTranscriptEntry } from "@nexus/shared";

const mic = (text: string): GranolaTranscriptEntry => ({
  speaker: { source: "microphone" },
  text,
});
const spk = (text: string): GranolaTranscriptEntry => ({
  speaker: { source: "speaker" },
  text,
});

export const INTERVIEW_PART_1: GranolaTranscriptEntry[] = [
  mic("Thanks for making time, Ernesto. Before we get into the role, tell me a bit about where you are right now."),
  spk("Yeah, happy to. So I'm an account executive today — I carried a one point two million dollar quota last year and finished at a hundred and thirty percent. The year before that was about a hundred and eighteen."),
  spk("Honestly the thing that's pushing me to look is that our comp plan changed and the territory got cut in half. I want to be somewhere where the upside is real."),
  mic("That makes sense. What does your evaluation process look like — are you talking to other companies?"),
  spk("I am, I'll be straight with you. I have a second-round with one other company next week. But this role is the one I'm most interested in because of the product motion."),
  spk("Can you walk me through how the commission structure works here? Like accelerators, kickers, what the on-target earnings actually look like?"),
  mic("Sure — base is two-ten OTE split fifty-fifty, accelerators kick in at one hundred percent of plan, no cap."),
  spk("Okay, no cap matters to me. And what does the ramp look like — is there a draw period while the pipeline builds?"),
  mic("Three-month guaranteed draw, then you're on plan."),
  spk("Got it. Personally — and I don't say this in every interview — my goal is to make the jump to enterprise within two years. My wife and I just had our first kid, so I'm optimizing for a place I can stay and grow."),
];

export const INTERVIEW_PART_2: GranolaTranscriptEntry[] = [
  mic("Let's talk about how you'd actually land here. What would your first ninety days look like?"),
  spk("So when I start — let's say July first, my notice period is two weeks and I've already mentally cleared it — the first thing I'd do is map the existing pipeline and shadow your top rep for the first two weeks."),
  spk("Actually, could I talk to one or two of the AEs currently on the team? I'd want to hear how they describe ramp and territory from their side."),
  mic("Absolutely, we can set that up this week."),
  spk("Great. And on the offer process — who else needs to sign off on your side? I want to make sure we can wrap this before my other process forces a decision."),
  mic("Just our VP of Sales, and she's already seen your background."),
  spk("Perfect. Then from my side: send me the comp plan doc and the offer details, and I'll have my answer to you within forty-eight hours of getting it. I've already told the other company I have a preferred option in motion."),
];
