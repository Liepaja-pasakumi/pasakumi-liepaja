/* =========================================================
   PARAUGA PASĀKUMI – izdomāti, tikai lai redzētu izskatu.
   2. solī šo failu izdzēsīsim, un pasākumi nāks no Supabase.

   Datumi rēķināti no šodienas (dienas: 0 = šodien, 1 = rīt ...),
   lai lapā vienmēr kaut kas būtu redzams.

   Kategorijas: "sports", "kultura", "berniem", "citi"
   ========================================================= */
(function () {
  function day(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + dd;
  }

  window.DEMO_EVENTS = [
    {
      id: "demo-11", featured: true, date: day(17), time: "17:00", category: "citi",
      title: "Pilsētas Ziemassvētku egles iedegšana",
      place: "Rožu laukums",
      price: "Bezmaksas",
      description: "Svētku koncerts, karstā tēja un egles gaismu iedegšana Liepājas centrā.",
      // Kad būs atļauta bilde: ieliec failu mapē images/ un atkomentē:
      // image: "images/egle.jpg",
      // image_credit: "Liepājas pašvaldība",
      url: "https://kalendars.liepaja.lv"
    },
    {
      id: "demo-1", featured: true, date: day(0), time: "19:00", category: "sports",
      title: "Basketbola spēle: BK Liepāja – viesu komanda",
      place: "Liepājas Olimpiskais centrs",
      price: "no 5 €",
      description: "Latvijas–Igaunijas basketbola līgas spēle. Atbalsti savējos!",
      url: "https://kalendars.liepaja.lv"
    },
    {
      id: "demo-2", date: day(0), time: "18:30", category: "kultura",
      title: "Simfoniskās mūzikas koncerts",
      place: "Koncertzāle \"Lielais dzintars\"",
      price: "15–30 €",
      description: "Liepājas Simfoniskais orķestris un viesdiriģents.",
      url: "https://kalendars.liepaja.lv"
    },
    {
      id: "demo-3", date: day(0), time: "11:00", category: "berniem",
      title: "Radošā darbnīca bērniem: rudens lapu kolāža",
      place: "Liepājas Centrālā zinātniskā bibliotēka",
      price: "Bezmaksas",
      description: "Bērniem no 4 gadiem kopā ar vecākiem. Materiāli nodrošināti.",
      url: "https://kalendars.liepaja.lv"
    },
    {
      id: "demo-4", featured: true, date: day(-3), end_date: day(20), time: null, category: "citi",
      title: "Izstāde \"Liepāja ceļā uz 2027\"",
      place: "Liepājas muzejs",
      price: "3 €",
      description: "Izstāde par Liepāju kā Eiropas kultūras galvaspilsētu 2027.",
      url: "https://kalendars.liepaja.lv"
    },
    {
      id: "demo-5", date: day(0), time: "20:00", category: "sports",
      title: "Hokejs: HK Liepāja – viesu komanda",
      place: "Liepājas Olimpiskā centra ledus halle",
      price: "no 4 €",
      description: "Optibet hokeja līgas regulārā sezona.",
      url: "https://kalendars.liepaja.lv"
    },
    {
      id: "demo-6", date: day(1), time: "19:00", category: "kultura",
      title: "Izrāde \"Vakara stāsti\"",
      place: "Liepājas teātris",
      price: "12–22 €",
      description: "Komēdija divās daļās.",
      url: "https://kalendars.liepaja.lv"
    },
    {
      id: "demo-7", date: day(1), time: "10:00", category: "sports",
      title: "Jauniešu volejbola turnīrs",
      place: "Liepājas Olimpiskais centrs",
      price: "Bezmaksas",
      description: "U16 komandas no visas Kurzemes.",
      url: "https://kalendars.liepaja.lv"
    },
    {
      id: "demo-8", date: day(2), time: "12:00", category: "berniem",
      title: "Leļļu izrāde mazajiem",
      place: "Liepājas teātris, mazā zāle",
      price: "6 €",
      description: "Izrāde bērniem no 3 gadiem.",
      url: "https://kalendars.liepaja.lv"
    },
    {
      id: "demo-9", date: day(4), time: "11:00", category: "sports",
      title: "Nūjošanas pārgājiens gar jūru",
      place: "Jūrmalas parks",
      price: "Bezmaksas",
      description: "Pulcēšanās pie Jūrmalas parka galvenās ieejas.",
      url: "https://kalendars.liepaja.lv"
    },
    {
      id: "demo-10", featured: true, date: day(7), time: "18:00", category: "citi",
      title: "Gadatirgus un amatnieku diena",
      place: "Rožu laukums",
      price: "Bezmaksas",
      description: "Vietējie amatnieki, ēdieni un mūzika.",
      url: "https://kalendars.liepaja.lv"
    }
  ];
})();
