/**
 * Primeiras orientações sobre cada idioma, exibidas na abertura da trilha.
 * São características gerais e bem estabelecidas de cada língua; como o restante do conteúdo
 * inicial, devem ser revisadas por um professor antes do lançamento.
 */
export interface LanguageTips {
  welcome: string;
  tips: string[];
}

export const LANGUAGE_TIPS: Record<string, LanguageTips> = {
  en: {
    welcome: "O inglês é um ótimo idioma para começar: os substantivos não têm gênero e os verbos mudam pouco.",
    tips: [
      "Não existe masculino e feminino para objetos: \"the\" serve para tudo (the house, the book).",
      "\"You\" significa tanto \"você\" quanto \"vocês\", e é usado em situações formais e informais.",
      "A escrita nem sempre indica a pronúncia — por isso, ouça o áudio de cada palavra.",
      "Contrações são muito comuns na fala: I'm = I am, don't = do not.",
    ],
  },
  es: {
    welcome: "O espanhol é muito próximo do português, mas cuidado com os falsos amigos!",
    tips: [
      "Substantivos são masculinos ou femininos: el libro (o livro), la casa (a casa).",
      "Perguntas e exclamações começam com o sinal invertido: ¿Cómo estás? ¡Hola!",
      "A letra ñ tem som parecido com o \"nh\" do português: mañana.",
      "Existem formas formais e informais de tratamento: tú (informal) e usted (formal).",
    ],
  },
  fr: {
    welcome: "O francês tem muitas palavras parecidas com o português, mas a pronúncia é bem diferente da escrita.",
    tips: [
      "Substantivos são masculinos ou femininos: le livre (o livro), la maison (a casa).",
      "Antes de vogal, \"le\" e \"la\" viram \"l'\": l'eau (a água).",
      "Muitas letras finais não são pronunciadas — ouça sempre o áudio.",
      "Os acentos mudam o som: é soa fechado, è soa aberto.",
    ],
  },
  de: {
    welcome: "O alemão tem regras bem consistentes: aprendendo o padrão, fica mais fácil.",
    tips: [
      "Todo substantivo começa com letra maiúscula: das Haus, die Mutter.",
      "Há três gêneros: der (masculino), die (feminino) e das (neutro). Aprenda cada palavra junto com o artigo.",
      "As letras ä, ö, ü e ß têm sons próprios. Se o teclado não tiver, use ae, oe, ue e ss.",
      "\"Sie\" com maiúscula é o tratamento formal; \"du\" é o informal.",
    ],
  },
  it: {
    welcome: "O italiano é musical e muito parecido com o português em vocabulário.",
    tips: [
      "Substantivos são masculinos ou femininos: il libro (o livro), la casa (a casa).",
      "A maioria das palavras termina em vogal.",
      "Consoantes duplas são pronunciadas de forma mais longa: nonna, caffè.",
      "\"Ciao\" serve tanto para cumprimentar quanto para se despedir (informal).",
    ],
  },
};

export const LEARNING_METHOD = [
  { icon: "👀", title: "Aprenda", text: "Veja cada palavra ou frase com tradução, áudio e explicação." },
  { icon: "🧩", title: "Pratique", text: "Exercícios do mais fácil ao mais difícil: reconhecer, escolher e escrever." },
  { icon: "🔁", title: "Revise", text: "O que você aprendeu volta na hora certa (revisão espaçada)." },
  { icon: "🏆", title: "Desafie-se", text: "Use o vocabulário nos jogos de digitação e de voz." },
];
