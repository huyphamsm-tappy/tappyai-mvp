// Interest taxonomy: parent → direct children.
// Affinity propagation walks bottom-up: child score bleeds into every ancestor.
// Edit this object to add, rename, or restructure categories — no other file changes needed.

export const TAXONOMY_TREE: Record<string, string[]> = {
  // ── Food & Drink ──────────────────────────────────────────────────────────
  Food: ['Restaurant', 'Cafe', 'Street Food', 'Dessert', 'Drink', 'Bakery'],

  Restaurant: [
    'Buffet', 'BBQ', 'Seafood', 'Hotpot',
    'Korean', 'Japanese', 'Viet Food', 'Chinese', 'Western',
  ],
  BBQ: ['Korean BBQ', 'Nướng', 'Lẩu Nướng'],
  Buffet: ['Buffet Nướng'],
  Seafood: ['Hải sản'],
  Hotpot: ['Lẩu'],

  // Cafe / coffee — "Coffee" and "Cà phê" are leaf children of Cafe
  Cafe: ['Coffee', 'Cà phê', 'Trà sữa', 'Cold Brew', 'Espresso'],

  'Street Food': ['Bún', 'Phở', 'Cơm', 'Bánh Mì', 'Xôi', 'Bún Bò', 'Hủ Tiếu'],
  Dessert: ['Kem', 'Chè', 'Bánh ngọt', 'Pudding', 'Waffle'],
  Drink: ['Nước ép', 'Sinh tố', 'Cocktail', 'Beer', 'Wine'],
  Bakery: ['Bánh', 'Croissant', 'Sourdough'],

  // ── Travel & Accommodation ────────────────────────────────────────────────
  Travel: ['Hotel', 'Resort', 'Beach', 'Mountain', 'Camping', 'City Trip'],

  Hotel: ['Budget Hotel', 'Luxury Hotel', 'Family Hotel', 'Boutique Hotel'],
  Resort: ['Beach Resort', 'Mountain Resort', 'Eco Resort'],

  // ── Entertainment ─────────────────────────────────────────────────────────
  Entertainment: ['Cinema', 'Karaoke', 'Live Music', 'Bar', 'Nightlife', 'Games', 'Museum'],

  Bar: ['Cocktail Bar', 'Beer Bar', 'Rooftop Bar', 'Sports Bar'],

  // ── Wellness ──────────────────────────────────────────────────────────────
  Wellness: ['Spa', 'Massage', 'Beauty', 'Gym', 'Yoga'],

  Spa: ['Day Spa', 'Foot Massage', 'Full Body Massage', 'Hot Spring'],
  Beauty: ['Hair Salon', 'Nail', 'Makeup'],

  // ── Shopping ──────────────────────────────────────────────────────────────
  Shopping: ['Mall', 'Market', 'Fashion', 'Electronics'],

  Market: ['Night Market', 'Organic Market', 'Flea Market'],
}
