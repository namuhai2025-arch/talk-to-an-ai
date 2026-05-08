const tiers = [
  {
    name: "Free",
    price: "Free",
    bestFor: "New / casual users",
    features: [
      "18 messages per day",
      "Core emotional support",
      "Medium replies",
      "Basic recent memory",
      "Basic mood awareness",
      "Limited stoic / grounding mode",
      "Anonymous access",
    ],
  },
  {
    name: "Talkio Pro",
    price: "$4.99/month",
    bestFor: "Daily emotionally invested users",
    features: [
      "Much higher daily limit",
      "Longer, more natural replies",
      "Enhanced emotional depth",
      "Better memory continuity",
      "Smart scheduled check-ins",
      "Full stoic / grounding modes",
      "Priority access during traffic",
      "Early access to new features",
      "Future voice features planned",
    ],
  },
];

{tiers.map((tier) => (
  <div key={tier.name}>
    <h2>{tier.name}</h2>
    <p>{tier.price}</p>

    {tier.features.map((feature) => (
      <p key={feature}>{feature}</p>
    ))}
  </div>
))}