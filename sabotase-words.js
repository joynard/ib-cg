/**
 * Sabotase Kata (CG Chameleon / Undercover) - Word Bank
 * Kategori yang relevan dan kontekstual untuk Connect Group (CG).
 */

const SABOTASE_WORDS = {
  tokoh_alkitab: {
    categoryName: "Tokoh Alkitab",
    words: [
      "Musa", "Daud", "Nuh", "Petrus", "Paulus", "Yunus", "Samson", 
      "Daniel", "Yusuf", "Abraham", "Elia", "Yosua", "Salomo", "Gideon"
    ]
  },
  tempat_nongkrong: {
    categoryName: "Tempat Nongkrong",
    words: [
      "Starbucks", "Kopi Kenangan", "Warkop", "Bioskop", "Mall", 
      "Food Court", "Rooftop Cafe", "Pasar Malam", "Minimarket", "Taman Kota"
    ]
  },
  daily_life: {
    categoryName: "Istilah Daily Life",
    words: [
      "Begadang", "Rebahan", "Scroll TikTok", "Ojek Online", "Deadline", 
      "Alarm Pagi", "Nugas Bareng", "Wi-Fi Lemot", "Salah Kirim Chat", "Lupa Password"
    ]
  },
  makanan_minuman: {
    categoryName: "Makanan & Minuman",
    words: [
      "Indomie Goreng", "Boba", "Martabak Manis", "Seblak", "Bakso Urat", 
      "Sate Ayam", "Nasi Padang", "Es Teh Manis", "Ayam Geprek", "Gorengan"
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SABOTASE_WORDS };
}
