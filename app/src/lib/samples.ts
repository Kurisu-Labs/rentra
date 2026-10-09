export type SampleItem = {
  id: string;
  name: string;
  blurb: string;
  value: string;
  rate: string;
  late: string;
  grace: string;
};

export const samples: SampleItem[] = [
  {
    id: "kamera",
    name: "Kamera mirrorless",
    blurb: "Badan kamera dan lensa kit. Cocok untuk syuting akhir pekan.",
    value: "Rp3.000.000",
    rate: "Rp150.000 / hari",
    late: "Rp10.000 / jam",
    grace: "24 jam",
  },
  {
    id: "tenda",
    name: "Tenda 2 orang",
    blurb: "Tenda double layer plus alas. Untuk pendakian singkat.",
    value: "Rp800.000",
    rate: "Rp60.000 / hari",
    late: "Rp5.000 / jam",
    grace: "12 jam",
  },
  {
    id: "kebaya",
    name: "Kebaya modern",
    blurb: "Satu set kebaya dan selendang. Ukuran M.",
    value: "Rp1.200.000",
    rate: "Rp100.000 / hari",
    late: "Rp8.000 / jam",
    grace: "24 jam",
  },
];

export function findSample(id: string): SampleItem | undefined {
  return samples.find((item) => item.id === id);
}
