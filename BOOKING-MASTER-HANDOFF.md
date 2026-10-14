K15.Space — Booking Master / AI implementation handoff
Last updated: 2026-10-14.
Intended repository: C:\Users\anton bocharov\Source\My\k15.space.
This is the implementation brief for the next AI working in that repository. It captures the booking-master discussion and distinguishes owner requirements from implementation suggestions. No production feature or calendar/CRM integration has been implemented in this conversation. The local Windows repository was not accessible to the author of this document.
1. Goal and current platform
K15.Space is an event venue in Kyiv, Ukraine, with two studios: Aura and Sakura.
The existing public site is https://k15space.com.ua/, consisting of static pages deployed on Cloudflare Pages. The owner wants an attractive, concise booking wizard with an interactive room preview and a live cart/price breakdown. It should replace the exhausting experience of the current Google Form.
Current form:
https://docs.google.com/forms/d/e/1FAIpQLSdm6r2iRD5PA8sTD4r1FymvkV2glkw-17F8tQPVo1YcRr-o5g/viewform
The venue uses Zoho Bigin CRM. Bookings already synchronize with Google Calendar, but the exact calendars, mapping and synchronization mechanism have not been inspected. Do not assume a particular integration configuration.
Before editing: read applicable AGENTS.md files, inspect the repository, its existing README, styles, assets and deployment configuration. Preserve the existing site architecture. Do not replace the main README with this feature brief.
2. Owner requirements
- Most of the feature should run on the frontend of the existing static site.
- Use large choices/cards, short labels and conditional questions rather than long text-heavy forms.
- Show only suitable studios. Avoid discovering an incompatible studio halfway through the wizard.
- Start with date, start time and duration, and check calendar availability before proceeding.
- Then ask guest count, then equipment requirements, then studio preference if multiple options remain.
- Projector and karaoke are available only in Sakura.
- Visually update the room while the customer adds/removes equipment and services.
- Show a cart-like list of selected services with a continuously updated total.
- Tableware costs 500 UAH for up to 10 guests, then 50 UAH per additional guest. For 12 guests, charge 600 UAH.
- Prefer predefined guest choices; collect exact count when pricing or capacity needs it.
- UI language should follow the current site, which is Ukrainian. This handoff is in English for implementation clarity.
The owner described microphones alongside projector/karaoke in the equipment question. Confirm whether microphones are exclusively available in Sakura and whether they belong to the same 500 UAH package. Do not silently treat that as established.
3. Latest wizard order
Earlier discussion considered putting equipment first. The latest owner direction supersedes that: date/time first.
Step 1 — Date, start and full rental duration
Ask date, start and duration together. A free start time alone is insufficient: the complete rental interval must be available.
- Show time in Europe/Kyiv, regardless of visitor/browser timezone.
- Use duration buttons plus a custom option with 30-minute increments, subject to confirmed rental rules.
- Explain briefly that customer setup and dismantling of their own decorations must fit inside rental time.
- Check available room options on that interval before collecting unrelated details.
- If nothing is available, offer alternative dates/times without losing existing answers.
- Never show all slots as free when Calendar cannot be reached. Distinguish unavailable, loading, error and genuinely no availability.
Step 2 — Guests and capacity-relevant layout
Use non-overlapping choices, preferably aligned with real room-capacity thresholds. Avoid ambiguous overlapping choices such as “up to 8” and “up to 10” unless their semantics are made explicit.
Ask seating/layout here if it can affect eligibility. Capacity-critical questions must occur before studio selection.
Unresolved capacity conflict:
- Owner said 15 guests excludes Aura.
- Owner said 20 or 25 guests requires both studios, with no single-studio alternative.
- The current Google Form says one table seats Aura up to 12, Sakura up to 14, and two tables in Sakura up to 20.
- The website lists up to 45 guests depending on format for the venue as a whole. This is not verified capacity for either studio individually.
Do not encode a final 13–19 / 20+ policy solely from the previous assistant's suggestion. Ask the owner to confirm the matrix by studio and layout, and whether the newest 20+ rule supersedes the form. If implementing a demo before confirmation, keep these rules configurable and clearly provisional.
Step 3 — Equipment
Ask whether projector / karaoke is required. Selecting it excludes Aura immediately.
- Show the package price next to the choice.
- “Not sure / help me choose” is a consultation state, not a purchase. Do not add a charge or force laptop selection.
- If required equipment eliminates the remaining calendar-compatible options, immediately offer alternatives for Sakura.
- Ask about own laptop vs rental only when relevant.
Step 4 — Choose a compatible studio
Compute the remaining candidates as the intersection of:
1. Calendar availability for the whole interval.
2. Guest/layout capacity.
3. Required equipment/resources.
If both Aura and Sakura are suitable, show their actual photos and let the customer choose. If only one qualifies, explain why it was selected. If both studios are needed, both must be available simultaneously for the complete interval.
Do not present a studio as definitively selected before the relevant requirements are gathered. Changing upstream answers must invalidate incompatible downstream choices and trigger availability recalculation where necessary.
Step 5 — Services and visual configuration
Conditional extras: tableware, tablecloths, banner/photo zone, red carpet, turnkey decor, laptop. Show only relevant follow-up questions, with compact price labels and expandable details.
Step 6 — Contact, review and submission
Collect name, phone or Instagram, optional wishes, and a readable final breakdown. Allow editing earlier choices.
The safe initial business flow is request for booking, pending administrator confirmation. Do not claim a confirmed booking until the backend has actually completed the applicable confirmation process. Deposit and cancellation rules are not yet defined.
4. Known rates and conditions
These were read from the live site/form during this discussion. Reconfirm before production; keep rates in a single versioned configuration rather than scattered UI code.
Item	Observed price / condition
Aura rental	1,300 UAH/hour
Sakura rental	1,300 UAH/hour
Projector + karaoke equipment package	500 UAH for the rental; Sakura only
Venue laptop rental	200 UAH for the rental
Tableware	500 UAH up to 10; +50 UAH per guest above 10
Disposable tablecloths	50 UAH per food/drink table; two pieces at 25 UAH
White fabric tablecloth	250 UAH per table for the rental
Customer's own tablecloth	No venue tablecloth charge
Banner/photo zone	500 UAH for the rental
Red carpet	350 UAH for the rental
Banner + red carpet	850 UAH for the rental
Turnkey decoration	Quote after consultation; no established fixed price


The form says a food table is 280 × 100 cm and needs two disposable tablecloths. Ask the number of food/drink tables, which may differ from seating tables. Food includes snacks and drinks.
The site lists hours 07:00–23:00 daily by appointment. Reconfirm scheduling rules, minimum duration and buffers.
Tableware formula when selected:
const tablewarePrice = 500 + Math.max(0, guestCount - 10) * 50;
If tableware is not selected, price is zero. Validate positive integer guest count. Do not calculate an exact tableware quote from an ambiguous guest range.
Example, assuming all these choices are valid:
Item	UAH
Sakura, 3 h × 1,300	3,900
Projector/karaoke	500
Tableware for 12 guests	600
Fabric tablecloth, one table	250
Total	5,250


Both-studio pricing, discounts, minimum hire, rounding, deposit and taxes must be confirmed rather than invented. Do not charge laptop separately for each requested equipment item if it is a single rental.
5. Visual room configurator
Owner's concept: while moving through the wizard, the customer sees the selected studio transform: projector image appears on the wall, dishes appear on the table, chosen tablecloth appears, decorations appear. The sidebar simultaneously lists the corresponding services and prices.
Suggested implementation:
- Use a real studio photo as the base.
- Create transparent PNG/WebP overlays for projector projection, tablecloth, tableware, laptop, photo zone and carpet.
- Prepare every layer for the same camera angle, perspective, lighting and canvas dimensions.
- Use a relative container and absolute image layers that scale together.
- Render tablecloth below dishes. Preload likely overlays and use short transitions respecting reduced-motion preferences.
- Separate base scenes for Aura/Sakura and for materially different table layouts; avoid preparing every possible full-image combination.
- Keep one shared booking state as the source for preview, cart and submission payload.
- A typical tableware arrangement may illustrate the service; the cart must display exact guest count and exact price. Do not claim that a generic preview depicts precisely 12 settings.
- Caption it as an illustrative configuration, not a guarantee that bespoke decor will exactly match the image.
- For turnkey decor, show example/reference choices and an unpriced consultation item.
Follow existing site styling. During inspection it used a cream background, dark chocolate text, pink accents and rounded controls. Reuse repository tokens and assets rather than rebuilding branding from approximate colors.
Desktop suggestion: question area + dominant room preview + cart sidebar. Mobile: question, preview, compact total/action area with expandable breakdown. All choices must remain keyboard-accessible and usable at narrow widths.
The first conversation sketch was conceptual, with demo dates and an outdated equipment-first order. It is not a production implementation and must not dictate final business logic.
6. Frontend architecture
Plain HTML/CSS/JavaScript is sufficient; React is not required. Inspect the project before choosing a framework. Do not migrate the whole static site just for this feature.
Suggested route: /booking/ (proposed, not already established).
Suggested modules:
- Booking state and step transitions.
- Configurable capacities, equipment and rates.
- Pure eligibility and price calculation functions.
- Layered room-preview renderer.
- Cart renderer and accessible form controls.
- Availability/submission API client with explicit demo/live modes.
Suggested state fields:
date, startTime, rentalDuration, timezone
guestCount / guestRange, seatingLayout
requiredEquipment, studioSelection
tableware, tableclothType, foodTableCount
decorOptions, laptopRental
contactName, contactMethod, contactValue, wishes
availabilityStatus, quoteVersion, bookingRequestId
Local selections may persist during navigation. Avoid automatically persisting private contact details. Never embed Google or Bigin credentials in frontend assets. The browser price is an immediate estimate; submission must be independently validated server-side.
7. Cloudflare backend
Keep static content on Cloudflare Pages. Add small Pages Functions for Calendar, CRM and trusted validation. No VPS is needed for this architecture.
Suggested endpoints (names are proposals):
- GET /api/availability: candidate studio/time availability for a validated interval.
- POST /api/booking: validate selection, recompute quote, recheck availability and save request.
- Optional quote endpoint if centralized pricing needs immediate server validation.
Pages Functions live in /functions at project root, not inside /dist. If the project uses a static output directory, retain that layout. Route Functions to /api/* so ordinary pages/assets stay static.
Deploy the /functions folder using Wrangler or supported CI. Cloudflare dashboard drag-and-drop does not compile that folder. Keep existing project/deployment settings; inspect them before changing configuration. Separate preview/test credentials and calendars from production.
Store integration secrets in Cloudflare Secrets. Use narrowly scoped server-side authorization. Persist booking requests and integration state so a temporary CRM error cannot silently discard a customer submission; design retry/idempotency handling.
8. Google Calendar availability
- Query busy intervals with Calendar API freeBusy.query when there is a separate calendar for each studio.
- If both studios share one calendar, FreeBusy alone cannot distinguish their individual room events. Either introduce dedicated calendars or read events with a reliable structured studio field. Do not infer studio purely from arbitrary event title text.
- Treat the calendar mapping as unverified until inspected.
- Include confirmed bookings, holds and all operational blackout periods that should prevent booking.
- Consider client rental duration and separate operational setup/cleanup buffers. Turnkey decor may still consume staff preparation time even if it is not billed as client setup.
- Preserve recurring-event handling and daylight-saving correctness.
- Backend returns only appropriate availability, not other customers' event titles or contact details.
- Recheck before accepting a submission; a displayed slot is not a reservation.
9. CRM, holds and concurrency
Bigin API supports contacts, pipeline records and events. Map the booking to the owner's actual pipeline/fields after inspection. Suggested stored data: room(s), interval, guests, layout, equipment, services, quote, source, contact and status.
Suggested status flow, requiring owner approval:
New request → temporary hold → awaiting deposit → confirmed / cancelled / expired.
Do not rely on native Bigin/Calendar synchronization being instantaneous or supporting every calendar. Zoho documentation notes recurring events are not supported by its native synchronization.
Choose one owner/path for calendar event creation and store related IDs. Avoid creating an event directly in Google and again through Bigin synchronization. Test update/cancel behavior and duplicate prevention.
For actual holds, protect overlapping intervals atomically. A check followed by an unguarded insert is insufficient. Cloudflare Durable Objects are one possible coordination mechanism; a Pages project can bind a Durable Object deployed in a separate Worker. A transactionally correct database approach is another option.
Coordinate both-room reservations atomically. Do not reserve Aura and then fail to reserve Sakura leaving a partial booking. A local lock only coordinates writers using that backend: administrators creating events directly in external calendars remain a potential race. Establish a unified write process or retain administrator confirmation rather than promising fully automatic conflict-proof booking.
Use idempotency keys for repeat clicks/retries and defined hold expiry. Confirm hold duration and release policy. Pending requests without a guaranteed hold must be labeled accurately.
10. Current form audit
Observed shared questions: event description, guest count, date, start, duration; decoration; seating arrangement and food; tablecloth; tableware and equipment; device; wishes and discovery source. No customer contact field was observed in the final section; it assumes continuation in Instagram.
Observed branch routes:
Question	Route
Turnkey decor	Informational decor screen, then layout/food
Photo-zone rental	Banner/carpet/both/consultation selection, then layout/food
Self decoration	Setup/removal instructions, then layout/food
No decor / decide later	Skip decor details
Food yes / “do snacks count?”	Tablecloth choice
Food no / not sure	Skip tablecloth choice
Projector yes / not sure	Device-selection screen
Projector no	Final section
Device own / rental / help	Final section


Main issues to correct:
- Equipment and preparation constraints are asked too late.
- Projector “not sure” incorrectly gets an affirmative message and mandatory device choice.
- Important questions require free text instead of sensible choices.
- Food-table count is missing despite per-table charges.
- Contact details are missing.
- “We received your request” appears before actual submission.
- Tableware remains optional independently of food; do not hide useful options without considering drinks-only use.
- Discovery source should not obstruct booking. It can be optional or recorded from attribution where appropriate.
11. Implementation sequence
1. Inspect repository and confirm capacity/rental policies that affect eligibility.
2. Implement the static wizard, eligibility rules, cart and price functions with clearly labeled mock availability.
3. Build a small initial visual asset set: two studios, fixed table layouts, projector, dishes, tablecloth and photo zone.
4. Test responsive interactions, backtracking and price updates.
5. Connect real Calendar through Pages Functions after verifying room-calendar mapping.
6. Add durable request saving and Bigin integration, with explicit pending/confirmed states.
7. Add holds/concurrency protections if automatic reservation is required.
8. Validate using test calendars/CRM records and a preview deployment before production.
Never pass demo availability off as live availability. Do not create production test bookings or publish the feature unless the owner has authorized that action.
12. Required checks
- 8 guests, no equipment, both free: both studio choices available if confirmed layout rules allow.
- Projector requested: Aura excluded.
- Only Aura free + projector: alternatives for Sakura, answers retained.
- 15 guests: Aura excluded per owner direction; enforce confirmed Sakura layout limits.
- 20/25 guests: follow owner-confirmed two-studio rule; no partial reservation.
- One table in Sakura cannot exceed the confirmed one-table capacity.
- Tableware 8/10 guests = 500; 11 = 550; 12 = 600; unselected = 0.
- Tablecloth charge depends on food-table count.
- Removing services updates both preview and cart.
- Equipment/room changes clear incompatible options explicitly.
- Duration/setup changes recheck the full interval.
- Quote tampering rejected/recomputed server-side.
- Concurrent/repeated submissions do not create duplicate holds or CRM records.
- Calendar/CRM failure has a clear recoverable UI; no false success.
- Keyboard/mobile accessibility and loading/error states work.
13. Questions to resolve with the owner
1. Final capacity matrix: each studio, one/two tables, standing, chairs-only, both studios; does 20+ always require both?
2. Microphones: availability, package and independent pricing?
3. Minimum rental, increments, opening hours, lead time and booking horizon?
4. Customer setup/removal versus operational buffers; preparation for venue-supplied decor?
5. Both-studio hourly rate and any discounts?
6. Current room calendar IDs, event structure and Bigin synchronization ownership?
7. Bigin pipeline, custom fields, plan/API limits and data-center region?
8. Does submitting create a hold, for how long, and how is it confirmed/released?
9. Deposit, cancellation and confirmation rules?
10. Exact photo angles/assets and whether limited inventory (laptop, photo zone, etc.) also needs conflict checks?
Proceed independently on reversible frontend work while keeping unresolved business rules explicit and configurable.
14. Official technical references
- Pages Functions: https://developers.cloudflare.com/pages/functions/get-started/
- Bindings and secrets: https://developers.cloudflare.com/pages/functions/bindings/
- API routing: https://developers.cloudflare.com/pages/functions/routing/
- Deployment: https://developers.cloudflare.com/pages/get-started/direct-upload/
- Pricing: https://developers.cloudflare.com/pages/functions/pricing/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Google FreeBusy: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- Bigin record creation: https://www.bigin.com/developer/docs/apis/v2/insert-records.html
- Bigin Google synchronization: https://help.zoho.com/portal/en/kb/bigin/integration/articles/integrate-google-bigin
Pricing snapshot discussed on 2026-10-14: Functions use Workers billing; free plan includes 100,000 requests/day shared with Workers and 10 ms CPU/invocation; paid plan starts at $5/month with usage allowances. Static requests that do not invoke Functions remain free. Verify current prices/limits before deployment; do not assume the complete integration fits free CPU limits without testing.