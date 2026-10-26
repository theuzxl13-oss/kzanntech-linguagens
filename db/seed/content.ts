/**
 * Conteúdo inicial do KeyLingo.
 *
 * IMPORTANTE: este material foi redigido pela equipe de desenvolvimento (com apoio de IA)
 * a partir de vocabulário básico e expressões de uso corrente. Ele é importado com
 * review_status = 'pending_review' e deve ser revisado por professores ou falantes nativos
 * no painel administrativo (Admin → Conteúdo → Revisão) antes de ser marcado como aprovado.
 *
 * Formato de cada tradução:
 *   - "texto"                         → resposta principal
 *   - { t, alt?, pt?, note? }         → principal + alternativas aceitas no idioma,
 *                                       respostas extras aceitas em português e observação
 */

export const CONTENT_SOURCE =
  "Seed inicial KeyLingo (redigido pela equipe com apoio de IA) — pendente de revisão por professor/falante nativo";

export type LangCode = "en" | "es" | "fr" | "de" | "it";

export type Translation = string | { t: string; alt?: string[]; pt?: string[]; note?: string };

export interface Concept {
  cat: string;
  level: "A1" | "A2" | "B1" | "B2";
  kind: "word" | "phrase";
  pt: string;
  ptAlt?: string[];
  tr: Record<LangCode, Translation>;
}

export const LANGUAGES = [
  { code: "en", name_pt: "Inglês", native_name: "English", flag: "🇬🇧", locale: "en-US", sort_order: 1 },
  { code: "es", name_pt: "Espanhol", native_name: "Español", flag: "🇪🇸", locale: "es-ES", sort_order: 2 },
  { code: "fr", name_pt: "Francês", native_name: "Français", flag: "🇫🇷", locale: "fr-FR", sort_order: 3 },
  { code: "de", name_pt: "Alemão", native_name: "Deutsch", flag: "🇩🇪", locale: "de-DE", sort_order: 4 },
  { code: "it", name_pt: "Italiano", native_name: "Italiano", flag: "🇮🇹", locale: "it-IT", sort_order: 5 },
] as const;

export const LEVELS = [
  { code: "A1", name_pt: "Iniciante", description: "Palavras e frases muito simples do dia a dia.", sort_order: 1, difficulty: 1.0, rank_weight: 0.7 },
  { code: "A2", name_pt: "Básico", description: "Situações rotineiras e trocas simples de informação.", sort_order: 2, difficulty: 1.15, rank_weight: 0.78 },
  { code: "B1", name_pt: "Intermediário", description: "Viagens, trabalho e assuntos familiares.", sort_order: 3, difficulty: 1.3, rank_weight: 0.86 },
  { code: "B2", name_pt: "Intermediário superior", description: "Comunicação profissional e textos mais complexos.", sort_order: 4, difficulty: 1.45, rank_weight: 0.93 },
  { code: "C1", name_pt: "Avançado", description: "Uso fluente e flexível do idioma.", sort_order: 5, difficulty: 1.6, rank_weight: 1.0 },
  { code: "C2", name_pt: "Proficiente", description: "Domínio próximo ao de um falante nativo.", sort_order: 6, difficulty: 1.75, rank_weight: 1.0 },
] as const;

export const CATEGORIES = [
  { slug: "cumprimentos", name_pt: "Cumprimentos", icon: "👋", sort_order: 1 },
  { slug: "apresentacoes", name_pt: "Apresentações pessoais", icon: "🙋", sort_order: 2 },
  { slug: "numeros", name_pt: "Números", icon: "🔢", sort_order: 3 },
  { slug: "familia", name_pt: "Família", icon: "👨‍👩‍👧", sort_order: 4 },
  { slug: "alimentos", name_pt: "Alimentos", icon: "🍎", sort_order: 5 },
  { slug: "viagens", name_pt: "Viagens", icon: "✈️", sort_order: 6 },
  { slug: "trabalho", name_pt: "Trabalho", icon: "💼", sort_order: 7 },
  { slug: "tecnologia", name_pt: "Tecnologia", icon: "💻", sort_order: 8 },
  { slug: "cotidiano", name_pt: "Conversas cotidianas", icon: "💬", sort_order: 9 },
  { slug: "profissional", name_pt: "Situações profissionais", icon: "📊", sort_order: 10 },
] as const;

export const CONCEPTS: Concept[] = [
  // ---------------- Cumprimentos ----------------
  {
    cat: "cumprimentos", level: "A1", kind: "word", pt: "olá", ptAlt: ["oi"],
    tr: {
      en: { t: "hello", alt: ["hi"] },
      es: "hola",
      fr: { t: "salut", alt: ["bonjour"], pt: ["tchau"], note: "\"Salut\" é informal e serve tanto para cumprimentar quanto para se despedir." },
      de: "hallo",
      it: { t: "ciao", alt: ["salve"], pt: ["tchau"], note: "\"Ciao\" é informal e serve para cumprimentar e para se despedir." },
    },
  },
  {
    cat: "cumprimentos", level: "A1", kind: "phrase", pt: "bom dia",
    tr: {
      en: "good morning",
      es: "buenos días",
      fr: { t: "bonjour", pt: ["olá", "boa tarde"], note: "\"Bonjour\" é usado durante todo o dia, até o início da noite." },
      de: "Guten Morgen",
      it: { t: "buongiorno", alt: ["buon giorno"] },
    },
  },
  {
    cat: "cumprimentos", level: "A1", kind: "phrase", pt: "boa tarde",
    tr: {
      en: "good afternoon",
      es: "buenas tardes",
      fr: { t: "bon après-midi", note: "Costuma ser usado como despedida; para cumprimentar à tarde, diz-se \"bonjour\"." },
      de: { t: "Guten Tag", pt: ["bom dia", "olá"], note: "\"Guten Tag\" é um cumprimento formal usado durante o dia." },
      it: "buon pomeriggio",
    },
  },
  {
    cat: "cumprimentos", level: "A1", kind: "phrase", pt: "boa noite",
    tr: {
      en: { t: "good night", alt: ["good evening"] },
      es: "buenas noches",
      fr: { t: "bonsoir", alt: ["bonne nuit"] },
      de: { t: "Gute Nacht", alt: ["Guten Abend"] },
      it: { t: "buonanotte", alt: ["buona notte", "buonasera", "buona sera"] },
    },
  },
  {
    cat: "cumprimentos", level: "A1", kind: "word", pt: "tchau", ptAlt: ["adeus", "até logo"],
    tr: {
      en: { t: "goodbye", alt: ["bye"] },
      es: { t: "adiós", alt: ["chao", "chau", "hasta luego"] },
      fr: { t: "au revoir", alt: ["salut"] },
      de: { t: "auf Wiedersehen", alt: ["tschüss", "tschüs"] },
      it: { t: "arrivederci", alt: ["ciao"] },
    },
  },
  {
    cat: "cumprimentos", level: "A1", kind: "word", pt: "obrigado", ptAlt: ["obrigada"],
    tr: {
      en: { t: "thank you", alt: ["thanks"] },
      es: "gracias",
      fr: "merci",
      de: "danke",
      it: "grazie",
    },
  },
  {
    cat: "cumprimentos", level: "A1", kind: "phrase", pt: "por favor",
    tr: {
      en: "please",
      es: "por favor",
      fr: { t: "s'il vous plaît", alt: ["s'il te plaît"], note: "\"S'il vous plaît\" é formal; \"s'il te plaît\" é informal." },
      de: "bitte",
      it: "per favore",
    },
  },
  {
    cat: "cumprimentos", level: "A1", kind: "phrase", pt: "Como você está?", ptAlt: ["Como vai?", "Como vai você?", "Tudo bem?"],
    tr: {
      en: "How are you?",
      es: { t: "¿Cómo estás?", alt: ["¿Cómo está usted?", "¿Qué tal?"] },
      fr: { t: "Comment allez-vous ?", alt: ["Comment vas-tu ?", "Comment ça va ?", "Ça va ?"] },
      de: { t: "Wie geht es dir?", alt: ["Wie geht's?", "Wie geht es Ihnen?"] },
      it: { t: "Come stai?", alt: ["Come sta?", "Come va?"] },
    },
  },
  {
    cat: "cumprimentos", level: "A1", kind: "phrase", pt: "Prazer em conhecer você.",
    ptAlt: ["Prazer", "Muito prazer", "Prazer em conhecê-lo", "Prazer em conhecê-la", "Prazer em te conhecer"],
    tr: {
      en: { t: "Nice to meet you.", alt: ["Pleased to meet you."] },
      es: { t: "Mucho gusto.", alt: ["Encantado.", "Encantada."] },
      fr: { t: "Enchanté.", alt: ["Enchantée.", "Ravi de vous rencontrer.", "Ravie de vous rencontrer."] },
      de: { t: "Freut mich.", alt: ["Freut mich, Sie kennenzulernen.", "Freut mich, dich kennenzulernen."] },
      it: { t: "Piacere.", alt: ["Piacere di conoscerti.", "Piacere di conoscerla."] },
    },
  },

  // ---------------- Apresentações pessoais ----------------
  {
    cat: "apresentacoes", level: "A1", kind: "word", pt: "nome", ptAlt: ["o nome"],
    tr: {
      en: "name",
      es: { t: "el nombre", alt: ["nombre"] },
      fr: { t: "le nom", alt: ["nom"] },
      de: { t: "der Name", alt: ["Name"], note: "Em alemão, todo substantivo começa com letra maiúscula." },
      it: { t: "il nome", alt: ["nome"] },
    },
  },
  {
    cat: "apresentacoes", level: "A1", kind: "phrase", pt: "Meu nome é Ana.",
    ptAlt: ["Eu me chamo Ana", "Me chamo Ana", "Eu sou a Ana", "Sou a Ana", "O meu nome é Ana"],
    tr: {
      en: { t: "My name is Ana.", alt: ["I'm Ana.", "I am Ana."] },
      es: { t: "Me llamo Ana.", alt: ["Mi nombre es Ana.", "Soy Ana."] },
      fr: { t: "Je m'appelle Ana.", alt: ["Mon nom est Ana.", "Je suis Ana."] },
      de: { t: "Ich heiße Ana.", alt: ["Mein Name ist Ana.", "Ich bin Ana."] },
      it: { t: "Mi chiamo Ana.", alt: ["Il mio nome è Ana.", "Sono Ana."] },
    },
  },
  {
    cat: "apresentacoes", level: "A1", kind: "phrase", pt: "Eu sou do Brasil.", ptAlt: ["Sou do Brasil", "Eu venho do Brasil", "Venho do Brasil"],
    tr: {
      en: { t: "I am from Brazil.", alt: ["I'm from Brazil."] },
      es: { t: "Soy de Brasil.", alt: ["Yo soy de Brasil."] },
      fr: { t: "Je viens du Brésil.", alt: ["Je suis du Brésil."] },
      de: "Ich komme aus Brasilien.",
      it: { t: "Vengo dal Brasile.", alt: ["Io vengo dal Brasile.", "Sono del Brasile."] },
    },
  },
  {
    cat: "apresentacoes", level: "A1", kind: "phrase", pt: "Quantos anos você tem?", ptAlt: ["Qual é a sua idade?", "Qual a sua idade?", "Quantos anos tens?"],
    tr: {
      en: "How old are you?",
      es: { t: "¿Cuántos años tienes?", alt: ["¿Cuántos años tiene usted?", "¿Cuántos años tiene?"] },
      fr: { t: "Quel âge as-tu ?", alt: ["Quel âge avez-vous ?", "Tu as quel âge ?"] },
      de: { t: "Wie alt bist du?", alt: ["Wie alt sind Sie?"] },
      it: { t: "Quanti anni hai?", alt: ["Quanti anni ha?"] },
    },
  },
  {
    cat: "apresentacoes", level: "A1", kind: "phrase", pt: "Eu moro em São Paulo.", ptAlt: ["Moro em São Paulo", "Vivo em São Paulo", "Eu vivo em São Paulo"],
    tr: {
      en: { t: "I live in São Paulo.", alt: ["I live in Sao Paulo."] },
      es: { t: "Vivo en São Paulo.", alt: ["Yo vivo en São Paulo.", "Vivo en Sao Paulo."] },
      fr: { t: "J'habite à São Paulo.", alt: ["Je vis à São Paulo.", "J'habite à Sao Paulo."] },
      de: { t: "Ich wohne in São Paulo.", alt: ["Ich lebe in São Paulo.", "Ich wohne in Sao Paulo."] },
      it: { t: "Abito a San Paolo.", alt: ["Vivo a San Paolo.", "Abito a São Paulo.", "Vivo a São Paulo."] },
    },
  },
  {
    cat: "apresentacoes", level: "A1", kind: "phrase", pt: "Eu sou estudante.", ptAlt: ["Sou estudante", "Eu sou aluno", "Sou aluno", "Eu sou aluna", "Sou aluna"],
    tr: {
      en: { t: "I am a student.", alt: ["I'm a student."] },
      es: { t: "Soy estudiante.", alt: ["Yo soy estudiante."] },
      fr: { t: "Je suis étudiant.", alt: ["Je suis étudiante."] },
      de: { t: "Ich bin Student.", alt: ["Ich bin Studentin.", "Ich bin Schüler.", "Ich bin Schülerin."] },
      it: { t: "Sono studente.", alt: ["Sono uno studente.", "Sono studentessa.", "Sono una studentessa.", "Io sono studente."] },
    },
  },

  // ---------------- Números ----------------
  {
    cat: "numeros", level: "A1", kind: "word", pt: "um", ptAlt: ["uma", "1"],
    tr: {
      en: { t: "one", alt: ["1"] },
      es: { t: "uno", alt: ["un", "una", "1"] },
      fr: { t: "un", alt: ["une", "1"] },
      de: { t: "eins", alt: ["1"] },
      it: { t: "uno", alt: ["un", "una", "1"] },
    },
  },
  {
    cat: "numeros", level: "A1", kind: "word", pt: "dois", ptAlt: ["duas", "2"],
    tr: {
      en: { t: "two", alt: ["2"] },
      es: { t: "dos", alt: ["2"] },
      fr: { t: "deux", alt: ["2"] },
      de: { t: "zwei", alt: ["2"] },
      it: { t: "due", alt: ["2"] },
    },
  },
  {
    cat: "numeros", level: "A1", kind: "word", pt: "três", ptAlt: ["3"],
    tr: {
      en: { t: "three", alt: ["3"] },
      es: { t: "tres", alt: ["3"] },
      fr: { t: "trois", alt: ["3"] },
      de: { t: "drei", alt: ["3"] },
      it: { t: "tre", alt: ["3"] },
    },
  },
  {
    cat: "numeros", level: "A1", kind: "word", pt: "cinco", ptAlt: ["5"],
    tr: {
      en: { t: "five", alt: ["5"] },
      es: { t: "cinco", alt: ["5"] },
      fr: { t: "cinq", alt: ["5"] },
      de: { t: "fünf", alt: ["5"] },
      it: { t: "cinque", alt: ["5"] },
    },
  },
  {
    cat: "numeros", level: "A1", kind: "word", pt: "dez", ptAlt: ["10"],
    tr: {
      en: { t: "ten", alt: ["10"] },
      es: { t: "diez", alt: ["10"] },
      fr: { t: "dix", alt: ["10"] },
      de: { t: "zehn", alt: ["10"] },
      it: { t: "dieci", alt: ["10"] },
    },
  },
  {
    cat: "numeros", level: "A1", kind: "word", pt: "vinte", ptAlt: ["20"],
    tr: {
      en: { t: "twenty", alt: ["20"] },
      es: { t: "veinte", alt: ["20"] },
      fr: { t: "vingt", alt: ["20"] },
      de: { t: "zwanzig", alt: ["20"] },
      it: { t: "venti", alt: ["20"] },
    },
  },
  {
    cat: "numeros", level: "A2", kind: "word", pt: "cem", ptAlt: ["100", "cento"],
    tr: {
      en: { t: "one hundred", alt: ["a hundred", "hundred", "100"] },
      es: { t: "cien", alt: ["100"] },
      fr: { t: "cent", alt: ["100"] },
      de: { t: "hundert", alt: ["einhundert", "100"] },
      it: { t: "cento", alt: ["100"] },
    },
  },

  // ---------------- Família ----------------
  {
    cat: "familia", level: "A1", kind: "word", pt: "mãe", ptAlt: ["a mãe", "mamãe"],
    tr: {
      en: { t: "mother", alt: ["mom", "mum"] },
      es: { t: "la madre", alt: ["madre", "mamá"] },
      fr: { t: "la mère", alt: ["mère", "maman"] },
      de: { t: "die Mutter", alt: ["Mutter", "Mama"] },
      it: { t: "la madre", alt: ["madre", "mamma"] },
    },
  },
  {
    cat: "familia", level: "A1", kind: "word", pt: "pai", ptAlt: ["o pai", "papai"],
    tr: {
      en: { t: "father", alt: ["dad"] },
      es: { t: "el padre", alt: ["padre", "papá"] },
      fr: { t: "le père", alt: ["père", "papa"] },
      de: { t: "der Vater", alt: ["Vater", "Papa"] },
      it: { t: "il padre", alt: ["padre", "papà"] },
    },
  },
  {
    cat: "familia", level: "A1", kind: "word", pt: "irmão", ptAlt: ["o irmão"],
    tr: {
      en: "brother",
      es: { t: "el hermano", alt: ["hermano"] },
      fr: { t: "le frère", alt: ["frère"] },
      de: { t: "der Bruder", alt: ["Bruder"] },
      it: { t: "il fratello", alt: ["fratello"] },
    },
  },
  {
    cat: "familia", level: "A1", kind: "word", pt: "irmã", ptAlt: ["a irmã"],
    tr: {
      en: "sister",
      es: { t: "la hermana", alt: ["hermana"] },
      fr: { t: "la sœur", alt: ["sœur", "la soeur", "soeur"] },
      de: { t: "die Schwester", alt: ["Schwester"] },
      it: { t: "la sorella", alt: ["sorella"] },
    },
  },
  {
    cat: "familia", level: "A1", kind: "word", pt: "filho", ptAlt: ["o filho"],
    tr: {
      en: "son",
      es: { t: "el hijo", alt: ["hijo"] },
      fr: { t: "le fils", alt: ["fils"] },
      de: { t: "der Sohn", alt: ["Sohn"] },
      it: { t: "il figlio", alt: ["figlio"] },
    },
  },
  {
    cat: "familia", level: "A2", kind: "word", pt: "avó", ptAlt: ["a avó", "vovó"],
    tr: {
      en: { t: "grandmother", alt: ["grandma", "granny"] },
      es: { t: "la abuela", alt: ["abuela"] },
      fr: { t: "la grand-mère", alt: ["grand-mère", "mamie"] },
      de: { t: "die Großmutter", alt: ["Großmutter", "Oma", "die Oma"] },
      it: { t: "la nonna", alt: ["nonna"] },
    },
  },
  {
    cat: "familia", level: "A1", kind: "phrase", pt: "Eu tenho dois irmãos.", ptAlt: ["Tenho dois irmãos", "Eu tenho 2 irmãos", "Tenho 2 irmãos"],
    tr: {
      en: { t: "I have two brothers.", alt: ["I have two siblings.", "I've got two brothers."] },
      es: { t: "Tengo dos hermanos.", alt: ["Yo tengo dos hermanos."] },
      fr: "J'ai deux frères.",
      de: { t: "Ich habe zwei Brüder.", alt: ["Ich habe zwei Geschwister."] },
      it: { t: "Ho due fratelli.", alt: ["Io ho due fratelli."] },
    },
  },
  {
    cat: "familia", level: "A1", kind: "phrase", pt: "Esta é a minha família.", ptAlt: ["Essa é a minha família", "Esta é minha família", "Essa é minha família"],
    tr: {
      en: "This is my family.",
      es: "Esta es mi familia.",
      fr: { t: "Voici ma famille.", alt: ["C'est ma famille."] },
      de: "Das ist meine Familie.",
      it: "Questa è la mia famiglia.",
    },
  },

  // ---------------- Alimentos ----------------
  {
    cat: "alimentos", level: "A1", kind: "word", pt: "água", ptAlt: ["a água"],
    tr: {
      en: "water",
      es: { t: "el agua", alt: ["agua"], note: "\"Agua\" é feminina, mas usa o artigo \"el\" por começar com \"a\" tônico." },
      fr: { t: "l'eau", alt: ["eau", "de l'eau"] },
      de: { t: "das Wasser", alt: ["Wasser"] },
      it: { t: "l'acqua", alt: ["acqua"] },
    },
  },
  {
    cat: "alimentos", level: "A1", kind: "word", pt: "pão", ptAlt: ["o pão"],
    tr: {
      en: "bread",
      es: { t: "el pan", alt: ["pan"] },
      fr: { t: "le pain", alt: ["pain"] },
      de: { t: "das Brot", alt: ["Brot"] },
      it: { t: "il pane", alt: ["pane"] },
    },
  },
  {
    cat: "alimentos", level: "A1", kind: "word", pt: "maçã", ptAlt: ["a maçã"],
    tr: {
      en: { t: "apple", alt: ["an apple"] },
      es: { t: "la manzana", alt: ["manzana"] },
      fr: { t: "la pomme", alt: ["pomme"] },
      de: { t: "der Apfel", alt: ["Apfel"] },
      it: { t: "la mela", alt: ["mela"] },
    },
  },
  {
    cat: "alimentos", level: "A1", kind: "word", pt: "queijo", ptAlt: ["o queijo"],
    tr: {
      en: "cheese",
      es: { t: "el queso", alt: ["queso"] },
      fr: { t: "le fromage", alt: ["fromage"] },
      de: { t: "der Käse", alt: ["Käse"] },
      it: { t: "il formaggio", alt: ["formaggio"] },
    },
  },
  {
    cat: "alimentos", level: "A1", kind: "word", pt: "café", ptAlt: ["o café"],
    tr: {
      en: "coffee",
      es: { t: "el café", alt: ["café"] },
      fr: { t: "le café", alt: ["café"] },
      de: { t: "der Kaffee", alt: ["Kaffee"] },
      it: { t: "il caffè", alt: ["caffè"] },
    },
  },
  {
    cat: "alimentos", level: "A2", kind: "phrase", pt: "Eu gostaria de um café, por favor.",
    ptAlt: ["Eu queria um café, por favor", "Queria um café, por favor", "Gostaria de um café, por favor", "Um café, por favor"],
    tr: {
      en: { t: "I would like a coffee, please.", alt: ["I'd like a coffee, please.", "A coffee, please."] },
      es: { t: "Quisiera un café, por favor.", alt: ["Me gustaría un café, por favor.", "Un café, por favor."] },
      fr: { t: "Je voudrais un café, s'il vous plaît.", alt: ["Un café, s'il vous plaît.", "Je voudrais un café, s'il te plaît."] },
      de: { t: "Ich hätte gern einen Kaffee, bitte.", alt: ["Ich hätte gerne einen Kaffee, bitte.", "Ich möchte einen Kaffee, bitte.", "Einen Kaffee, bitte."] },
      it: { t: "Vorrei un caffè, per favore.", alt: ["Un caffè, per favore."] },
    },
  },
  {
    cat: "alimentos", level: "A2", kind: "phrase", pt: "A conta, por favor.",
    tr: {
      en: { t: "The check, please.", alt: ["The bill, please.", "Check, please.", "Bill, please."] },
      es: "La cuenta, por favor.",
      fr: "L'addition, s'il vous plaît.",
      de: { t: "Die Rechnung, bitte.", alt: ["Zahlen, bitte."] },
      it: "Il conto, per favore.",
    },
  },

  // ---------------- Viagens ----------------
  {
    cat: "viagens", level: "A2", kind: "word", pt: "aeroporto", ptAlt: ["o aeroporto"],
    tr: {
      en: "airport",
      es: { t: "el aeropuerto", alt: ["aeropuerto"] },
      fr: { t: "l'aéroport", alt: ["aéroport"] },
      de: { t: "der Flughafen", alt: ["Flughafen"] },
      it: { t: "l'aeroporto", alt: ["aeroporto"] },
    },
  },
  {
    cat: "viagens", level: "A2", kind: "word", pt: "passaporte", ptAlt: ["o passaporte"],
    tr: {
      en: "passport",
      es: { t: "el pasaporte", alt: ["pasaporte"] },
      fr: { t: "le passeport", alt: ["passeport"] },
      de: { t: "der Reisepass", alt: ["Reisepass", "der Pass", "Pass"] },
      it: { t: "il passaporto", alt: ["passaporto"] },
    },
  },
  {
    cat: "viagens", level: "A2", kind: "word", pt: "estação de trem", ptAlt: ["a estação de trem", "estação ferroviária", "a estação"],
    tr: {
      en: { t: "train station", alt: ["railway station", "the train station"] },
      es: { t: "la estación de tren", alt: ["estación de tren", "la estación"] },
      fr: { t: "la gare", alt: ["gare"] },
      de: { t: "der Bahnhof", alt: ["Bahnhof"] },
      it: { t: "la stazione", alt: ["stazione", "la stazione ferroviaria"] },
    },
  },
  {
    cat: "viagens", level: "A2", kind: "word", pt: "mala", ptAlt: ["a mala", "mala de viagem"],
    tr: {
      en: { t: "suitcase", alt: ["a suitcase"] },
      es: { t: "la maleta", alt: ["maleta"] },
      fr: { t: "la valise", alt: ["valise"] },
      de: { t: "der Koffer", alt: ["Koffer"] },
      it: { t: "la valigia", alt: ["valigia"] },
    },
  },
  {
    cat: "viagens", level: "A1", kind: "phrase", pt: "Onde fica o banheiro?", ptAlt: ["Onde é o banheiro?", "Onde está o banheiro?"],
    tr: {
      en: { t: "Where is the bathroom?", alt: ["Where's the bathroom?", "Where is the restroom?", "Where is the toilet?"] },
      es: "¿Dónde está el baño?",
      fr: "Où sont les toilettes ?",
      de: "Wo ist die Toilette?",
      it: { t: "Dov'è il bagno?", alt: ["Dove è il bagno?"] },
    },
  },
  {
    cat: "viagens", level: "A1", kind: "phrase", pt: "Quanto custa?", ptAlt: ["Quanto é?"],
    tr: {
      en: { t: "How much is it?", alt: ["How much does it cost?", "How much?"] },
      es: { t: "¿Cuánto cuesta?", alt: ["¿Cuánto es?"] },
      fr: { t: "Combien ça coûte ?", alt: ["C'est combien ?", "Ça coûte combien ?"] },
      de: { t: "Wie viel kostet das?", alt: ["Was kostet das?", "Wieviel kostet das?"] },
      it: "Quanto costa?",
    },
  },
  {
    cat: "viagens", level: "A2", kind: "phrase", pt: "Eu preciso de um táxi.", ptAlt: ["Preciso de um táxi"],
    tr: {
      en: { t: "I need a taxi.", alt: ["I need a cab."] },
      es: { t: "Necesito un taxi.", alt: ["Yo necesito un taxi."] },
      fr: "J'ai besoin d'un taxi.",
      de: "Ich brauche ein Taxi.",
      it: "Ho bisogno di un taxi.",
    },
  },

  // ---------------- Trabalho ----------------
  {
    cat: "trabalho", level: "A2", kind: "word", pt: "reunião", ptAlt: ["a reunião"],
    tr: {
      en: "meeting",
      es: { t: "la reunión", alt: ["reunión"] },
      fr: { t: "la réunion", alt: ["réunion"] },
      de: { t: "die Besprechung", alt: ["Besprechung", "das Meeting", "Meeting", "die Sitzung"] },
      it: { t: "la riunione", alt: ["riunione"] },
    },
  },
  {
    cat: "trabalho", level: "A2", kind: "word", pt: "escritório", ptAlt: ["o escritório"],
    tr: {
      en: "office",
      es: { t: "la oficina", alt: ["oficina"] },
      fr: { t: "le bureau", alt: ["bureau"] },
      de: { t: "das Büro", alt: ["Büro"] },
      it: { t: "l'ufficio", alt: ["ufficio"] },
    },
  },
  {
    cat: "trabalho", level: "A2", kind: "word", pt: "chefe", ptAlt: ["o chefe", "a chefe"],
    tr: {
      en: "boss",
      es: { t: "el jefe", alt: ["jefe", "la jefa", "jefa"] },
      fr: { t: "le patron", alt: ["patron", "la patronne", "le chef", "chef"] },
      de: { t: "der Chef", alt: ["Chef", "die Chefin", "Chefin"] },
      it: { t: "il capo", alt: ["capo"] },
    },
  },
  {
    cat: "trabalho", level: "A2", kind: "phrase", pt: "Eu trabalho em um escritório.",
    ptAlt: ["Trabalho em um escritório", "Eu trabalho num escritório", "Trabalho num escritório"],
    tr: {
      en: "I work in an office.",
      es: { t: "Trabajo en una oficina.", alt: ["Yo trabajo en una oficina."] },
      fr: "Je travaille dans un bureau.",
      de: "Ich arbeite in einem Büro.",
      it: { t: "Lavoro in un ufficio.", alt: ["Io lavoro in un ufficio."] },
    },
  },
  {
    cat: "trabalho", level: "B1", kind: "phrase", pt: "A reunião começa às nove.",
    ptAlt: ["A reunião começa às 9", "A reunião começa às nove horas", "A reunião começa às 9 horas"],
    tr: {
      en: { t: "The meeting starts at nine.", alt: ["The meeting begins at nine.", "The meeting starts at 9."] },
      es: { t: "La reunión empieza a las nueve.", alt: ["La reunión comienza a las nueve."] },
      fr: { t: "La réunion commence à neuf heures.", alt: ["La réunion commence à 9 heures."] },
      de: { t: "Die Besprechung beginnt um neun Uhr.", alt: ["Die Besprechung beginnt um neun.", "Das Meeting beginnt um neun Uhr.", "Das Meeting beginnt um neun."] },
      it: { t: "La riunione inizia alle nove.", alt: ["La riunione comincia alle nove."] },
    },
  },

  // ---------------- Tecnologia ----------------
  {
    cat: "tecnologia", level: "A2", kind: "word", pt: "computador", ptAlt: ["o computador"],
    tr: {
      en: "computer",
      es: { t: "el ordenador", alt: ["ordenador", "la computadora", "computadora"], note: "\"Ordenador\" é usado na Espanha; \"computadora\" na maior parte da América Latina." },
      fr: { t: "l'ordinateur", alt: ["ordinateur"] },
      de: { t: "der Computer", alt: ["Computer", "der Rechner"] },
      it: { t: "il computer", alt: ["computer"] },
    },
  },
  {
    cat: "tecnologia", level: "A2", kind: "word", pt: "senha", ptAlt: ["a senha"],
    tr: {
      en: "password",
      es: { t: "la contraseña", alt: ["contraseña"] },
      fr: { t: "le mot de passe", alt: ["mot de passe"] },
      de: { t: "das Passwort", alt: ["Passwort", "das Kennwort", "Kennwort"] },
      it: { t: "la password", alt: ["password"] },
    },
  },
  {
    cat: "tecnologia", level: "A2", kind: "word", pt: "celular", ptAlt: ["o celular", "telemóvel", "smartphone", "telefone celular"],
    tr: {
      en: { t: "cell phone", alt: ["mobile phone", "cellphone", "phone", "smartphone"] },
      es: { t: "el móvil", alt: ["móvil", "el celular", "celular", "el teléfono móvil"] },
      fr: { t: "le portable", alt: ["portable", "le téléphone portable", "le smartphone"] },
      de: { t: "das Handy", alt: ["Handy", "das Smartphone"] },
      it: { t: "il cellulare", alt: ["cellulare", "il telefonino"] },
    },
  },
  {
    cat: "tecnologia", level: "A2", kind: "phrase", pt: "Esqueci minha senha.",
    ptAlt: ["Eu esqueci minha senha", "Esqueci a minha senha", "Eu esqueci a minha senha", "Esqueci a senha"],
    tr: {
      en: "I forgot my password.",
      es: { t: "Olvidé mi contraseña.", alt: ["He olvidado mi contraseña.", "Se me olvidó la contraseña."] },
      fr: "J'ai oublié mon mot de passe.",
      de: "Ich habe mein Passwort vergessen.",
      it: { t: "Ho dimenticato la mia password.", alt: ["Ho dimenticato la password."] },
    },
  },
  {
    cat: "tecnologia", level: "B1", kind: "phrase", pt: "A internet não está funcionando.",
    ptAlt: ["A internet não funciona", "A internet não está a funcionar"],
    tr: {
      en: { t: "The internet is not working.", alt: ["The internet isn't working.", "The internet doesn't work."] },
      es: { t: "Internet no funciona.", alt: ["El internet no funciona.", "Internet no está funcionando."] },
      fr: { t: "Internet ne marche pas.", alt: ["Internet ne fonctionne pas."] },
      de: "Das Internet funktioniert nicht.",
      it: { t: "Internet non funziona.", alt: ["Internet non sta funzionando."] },
    },
  },

  // ---------------- Conversas cotidianas ----------------
  {
    cat: "cotidiano", level: "A1", kind: "word", pt: "sim",
    tr: { en: "yes", es: "sí", fr: "oui", de: "ja", it: "sì" },
  },
  {
    cat: "cotidiano", level: "A1", kind: "word", pt: "não",
    tr: { en: "no", es: "no", fr: "non", de: "nein", it: "no" },
  },
  {
    cat: "cotidiano", level: "A1", kind: "word", pt: "casa", ptAlt: ["a casa", "lar"],
    tr: {
      en: { t: "house", alt: ["home"] },
      es: { t: "la casa", alt: ["casa"] },
      fr: { t: "la maison", alt: ["maison"] },
      de: { t: "das Haus", alt: ["Haus", "das Zuhause"] },
      it: { t: "la casa", alt: ["casa"] },
    },
  },
  {
    cat: "cotidiano", level: "A1", kind: "word", pt: "hoje",
    tr: { en: "today", es: "hoy", fr: "aujourd'hui", de: "heute", it: "oggi" },
  },
  {
    cat: "cotidiano", level: "A1", kind: "word", pt: "amanhã",
    tr: { en: "tomorrow", es: "mañana", fr: "demain", de: "morgen", it: "domani" },
  },
  {
    cat: "cotidiano", level: "A1", kind: "phrase", pt: "Eu gosto de aprender.", ptAlt: ["Gosto de aprender"],
    tr: {
      en: { t: "I like learning.", alt: ["I like to learn."] },
      es: { t: "Me gusta aprender.", alt: ["A mí me gusta aprender."] },
      fr: "J'aime apprendre.",
      de: { t: "Ich lerne gern.", alt: ["Ich lerne gerne."] },
      it: "Mi piace imparare.",
    },
  },
  {
    cat: "cotidiano", level: "A1", kind: "phrase", pt: "Que horas são?",
    tr: {
      en: "What time is it?",
      es: "¿Qué hora es?",
      fr: "Quelle heure est-il ?",
      de: { t: "Wie spät ist es?", alt: ["Wie viel Uhr ist es?"] },
      it: { t: "Che ore sono?", alt: ["Che ora è?"] },
    },
  },
  {
    cat: "cotidiano", level: "A1", kind: "phrase", pt: "Eu não entendo.", ptAlt: ["Não entendo", "Eu não compreendo", "Não compreendo"],
    tr: {
      en: { t: "I don't understand.", alt: ["I do not understand."] },
      es: { t: "No entiendo.", alt: ["Yo no entiendo.", "No comprendo."] },
      fr: "Je ne comprends pas.",
      de: { t: "Ich verstehe nicht.", alt: ["Ich verstehe das nicht."] },
      it: { t: "Non capisco.", alt: ["Io non capisco."] },
    },
  },
  {
    cat: "cotidiano", level: "A2", kind: "phrase", pt: "Você pode repetir, por favor?",
    ptAlt: ["Pode repetir, por favor?", "Você poderia repetir, por favor?", "Poderia repetir, por favor?"],
    tr: {
      en: { t: "Can you repeat that, please?", alt: ["Could you repeat that, please?", "Can you repeat, please?", "Could you repeat, please?"] },
      es: { t: "¿Puedes repetir, por favor?", alt: ["¿Puede repetir, por favor?"] },
      fr: { t: "Pouvez-vous répéter, s'il vous plaît ?", alt: ["Tu peux répéter, s'il te plaît ?", "Vous pouvez répéter, s'il vous plaît ?"] },
      de: { t: "Kannst du das bitte wiederholen?", alt: ["Können Sie das bitte wiederholen?"] },
      it: { t: "Puoi ripetere, per favore?", alt: ["Può ripetere, per favore?"] },
    },
  },
  {
    cat: "cotidiano", level: "A2", kind: "phrase", pt: "Está chovendo hoje.", ptAlt: ["Hoje está chovendo", "Está a chover hoje", "Chove hoje"],
    tr: {
      en: { t: "It is raining today.", alt: ["It's raining today."] },
      es: { t: "Hoy está lloviendo.", alt: ["Está lloviendo hoy.", "Hoy llueve."] },
      fr: "Il pleut aujourd'hui.",
      de: { t: "Heute regnet es.", alt: ["Es regnet heute."] },
      it: { t: "Oggi piove.", alt: ["Piove oggi.", "Oggi sta piovendo."] },
    },
  },

  // ---------------- Situações profissionais ----------------
  {
    cat: "profissional", level: "B1", kind: "word", pt: "prazo", ptAlt: ["o prazo", "data limite", "prazo final"],
    tr: {
      en: "deadline",
      es: { t: "el plazo", alt: ["plazo", "la fecha límite", "fecha límite"] },
      fr: { t: "la date limite", alt: ["date limite", "l'échéance", "le délai"] },
      de: { t: "die Frist", alt: ["Frist", "die Deadline", "Deadline"] },
      it: { t: "la scadenza", alt: ["scadenza"] },
    },
  },
  {
    cat: "profissional", level: "B1", kind: "word", pt: "contrato", ptAlt: ["o contrato"],
    tr: {
      en: "contract",
      es: { t: "el contrato", alt: ["contrato"] },
      fr: { t: "le contrat", alt: ["contrat"] },
      de: { t: "der Vertrag", alt: ["Vertrag"] },
      it: { t: "il contratto", alt: ["contratto"] },
    },
  },
  {
    cat: "profissional", level: "B1", kind: "phrase", pt: "Vou enviar o relatório amanhã.",
    ptAlt: ["Enviarei o relatório amanhã", "Eu vou enviar o relatório amanhã", "Vou mandar o relatório amanhã"],
    tr: {
      en: { t: "I will send the report tomorrow.", alt: ["I'll send the report tomorrow."] },
      es: { t: "Enviaré el informe mañana.", alt: ["Voy a enviar el informe mañana.", "Mañana enviaré el informe."] },
      fr: { t: "J'enverrai le rapport demain.", alt: ["Je vais envoyer le rapport demain."] },
      de: { t: "Ich schicke den Bericht morgen.", alt: ["Ich werde den Bericht morgen schicken.", "Ich sende den Bericht morgen."] },
      it: { t: "Invierò il rapporto domani.", alt: ["Manderò il rapporto domani.", "Domani invierò il rapporto."] },
    },
  },
  {
    cat: "profissional", level: "B1", kind: "phrase", pt: "Podemos marcar uma reunião?", ptAlt: ["Podemos agendar uma reunião?"],
    tr: {
      en: { t: "Can we schedule a meeting?", alt: ["Could we schedule a meeting?", "Can we set up a meeting?"] },
      es: { t: "¿Podemos programar una reunión?", alt: ["¿Podemos concertar una reunión?", "¿Podemos fijar una reunión?", "¿Podemos agendar una reunión?"] },
      fr: { t: "Pouvons-nous fixer une réunion ?", alt: ["Pouvons-nous organiser une réunion ?", "Pouvons-nous planifier une réunion ?"] },
      de: { t: "Können wir eine Besprechung vereinbaren?", alt: ["Können wir einen Termin vereinbaren?", "Können wir ein Meeting vereinbaren?"] },
      it: { t: "Possiamo fissare una riunione?", alt: ["Possiamo organizzare una riunione?"] },
    },
  },
  {
    cat: "profissional", level: "B1", kind: "phrase", pt: "Obrigado pela sua paciência.",
    ptAlt: ["Obrigada pela sua paciência", "Obrigado pela paciência", "Obrigada pela paciência"],
    tr: {
      en: { t: "Thank you for your patience.", alt: ["Thanks for your patience."] },
      es: { t: "Gracias por su paciencia.", alt: ["Gracias por tu paciencia."] },
      fr: { t: "Merci pour votre patience.", alt: ["Merci de votre patience.", "Merci pour ta patience."] },
      de: { t: "Vielen Dank für Ihre Geduld.", alt: ["Danke für Ihre Geduld.", "Danke für deine Geduld."] },
      it: { t: "Grazie per la sua pazienza.", alt: ["Grazie per la tua pazienza.", "Grazie della pazienza."] },
    },
  },
  {
    cat: "profissional", level: "B2", kind: "phrase", pt: "Poderia me enviar mais detalhes?",
    ptAlt: ["Você poderia me enviar mais detalhes?", "Pode me enviar mais detalhes?", "Poderia me mandar mais detalhes?"],
    tr: {
      en: { t: "Could you send me more details?", alt: ["Can you send me more details?", "Could you send me further details?"] },
      es: { t: "¿Podría enviarme más detalles?", alt: ["¿Puede enviarme más detalles?", "¿Podrías enviarme más detalles?"] },
      fr: { t: "Pourriez-vous m'envoyer plus de détails ?", alt: ["Pouvez-vous m'envoyer plus de détails ?", "Pourriez-vous m'envoyer davantage de détails ?"] },
      de: { t: "Könnten Sie mir weitere Details schicken?", alt: ["Könnten Sie mir mehr Details schicken?", "Können Sie mir mehr Details schicken?"] },
      it: { t: "Potrebbe mandarmi più dettagli?", alt: ["Potrebbe inviarmi più dettagli?", "Potresti mandarmi più dettagli?", "Puoi mandarmi più dettagli?"] },
    },
  },
  {
    cat: "profissional", level: "B2", kind: "phrase", pt: "Estou ansioso para trabalhar com vocês.",
    ptAlt: ["Estou ansiosa para trabalhar com vocês", "Mal posso esperar para trabalhar com vocês"],
    tr: {
      en: { t: "I look forward to working with you.", alt: ["I am looking forward to working with you.", "I'm looking forward to working with you."] },
      es: { t: "Tengo muchas ganas de trabajar con ustedes.", alt: ["Tengo ganas de trabajar con ustedes."] },
      fr: "J'ai hâte de travailler avec vous.",
      de: { t: "Ich freue mich auf die Zusammenarbeit mit Ihnen.", alt: ["Ich freue mich darauf, mit Ihnen zu arbeiten.", "Ich freue mich auf die Zusammenarbeit."] },
      it: { t: "Non vedo l'ora di lavorare con voi.", alt: ["Non vedo l'ora di lavorare con te."] },
    },
  },
];

export const ACHIEVEMENTS = [
  { code: "first_session", name_pt: "Primeiros passos", description_pt: "Conclua sua primeira sessão.", icon: "🚀", xp_reward: 20 },
  { code: "sessions_10", name_pt: "Dedicação", description_pt: "Conclua 10 sessões.", icon: "📚", xp_reward: 50 },
  { code: "sessions_50", name_pt: "Maratonista", description_pt: "Conclua 50 sessões.", icon: "🏃", xp_reward: 150 },
  { code: "perfect_session", name_pt: "Perfeição", description_pt: "Acerte 100% em uma sessão com pelo menos 8 respostas.", icon: "💎", xp_reward: 40 },
  { code: "answer_streak_10", name_pt: "Em chamas", description_pt: "Acerte 10 respostas seguidas em uma sessão.", icon: "🔥", xp_reward: 30 },
  { code: "streak_3", name_pt: "Constância", description_pt: "Estude 3 dias seguidos.", icon: "📅", xp_reward: 30 },
  { code: "streak_7", name_pt: "Semana completa", description_pt: "Estude 7 dias seguidos.", icon: "🗓️", xp_reward: 70 },
  { code: "streak_30", name_pt: "Hábito formado", description_pt: "Estude 30 dias seguidos.", icon: "🏆", xp_reward: 300 },
  { code: "first_voice", name_pt: "Primeira voz", description_pt: "Conclua sua primeira sessão de voz.", icon: "🎙️", xp_reward: 20 },
  { code: "both_modes", name_pt: "Versátil", description_pt: "Conclua sessões nos dois modos: digitação e voz.", icon: "🎯", xp_reward: 40 },
  { code: "polyglot", name_pt: "Poliglota", description_pt: "Conclua sessões em dois idiomas diferentes.", icon: "🌍", xp_reward: 50 },
  { code: "words_25", name_pt: "Vocabulário em expansão", description_pt: "Aprenda 25 palavras ou frases.", icon: "🧠", xp_reward: 60 },
  { code: "speedster", name_pt: "Dedos rápidos", description_pt: "Sessão de digitação com 90% de precisão e alta velocidade (mín. 10 respostas).", icon: "⚡", xp_reward: 40 },
  { code: "level_5", name_pt: "Nível 5", description_pt: "Alcance o nível 5.", icon: "⭐", xp_reward: 0 },
  { code: "level_10", name_pt: "Nível 10", description_pt: "Alcance o nível 10.", icon: "🌟", xp_reward: 0 },
] as const;
