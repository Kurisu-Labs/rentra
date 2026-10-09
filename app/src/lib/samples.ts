export type SampleItem = {
  id: string;
  name: string;
  category: string;
  icon: "camera" | "tent" | "dress";
  blurb: string;
  value: string;
  rate: string;
  late: string;
  grace: string;
};

export const samples: SampleItem[] = [
  {
    id: "kamera",
    name: "Mirrorless camera",
    category: "Photography",
    icon: "camera",
    blurb: "Camera body and kit lens. Make something worth remembering this weekend.",
    value: "Rp3,000,000",
    rate: "Rp150,000",
    late: "Rp10,000 / hour",
    grace: "24 hours",
  },
  {
    id: "tenda",
    name: "Two-person tent",
    category: "Outdoors",
    icon: "tent",
    blurb: "A double-layer tent with a groundsheet. Your next escape starts here.",
    value: "Rp800,000",
    rate: "Rp60,000",
    late: "Rp5,000 / hour",
    grace: "12 hours",
  },
  {
    id: "kebaya",
    name: "Modern kebaya set",
    category: "Occasions",
    icon: "dress",
    blurb: "A kebaya and matching shawl for a special day. Available in size M.",
    value: "Rp1,200,000",
    rate: "Rp100,000",
    late: "Rp8,000 / hour",
    grace: "24 hours",
  },
];

export function findSample(id: string): SampleItem | undefined {
  return samples.find((item) => item.id === id);
}
