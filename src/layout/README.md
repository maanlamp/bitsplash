# Layout

_Layout, styling, hiërarchie..._ wat is nou wat, en hoe houd je het onderhoudbaar?! Houd je vast, we gaan het ontdekken 😎.

<br/>

<details>
<summary>🗞️ TLDR</summary>

- Style en layout zijn niet hetzelfde
- Gebruik de componenten in Layout om gemakklijk onderhoudbare componenten op te bouwen, die netjes los staan van hun opmaak.
- Margin is nooit nodig, als er gebruikt wordt gemaakt van `Padding` en `Gap`.

</details>

<br/>

<details open>
<summary>📚 Inhoud</summary>

- [Layout](#layout)
  - [🖼️ Cascading Style Sheets](#️-cascading-style-sheets)
    - [✂️ Separation of Concerns](#️-separation-of-concerns)
    - [🏗️🆚🎨 Layout vs. Styling](#️-layout-vs-styling)
  - [📦 Flexbox](#-flexbox)
    - [🧱 Columns \& Rows](#-columns--rows)
    - [🤏 Gap vs. margin vs. padding](#-gap-vs-margin-vs-padding)
  - [🏁 Klaar](#-klaar)

</details>

<br/>

## 🖼️ Cascading Style Sheets

CSS is in _1994(!)_ bedacht door [de Noor Håkon Wium Lie](https://nl.wikipedia.org/wiki/H%C3%A5kon_Wium_Lie) in samenwerking met [de Nederlander Bert Bos](https://nl.wikipedia.org/wiki/Bert_Bos). Zij wilden een standaard ontwikkelen om het Wilde Westen van eigen stijl-software in browsers tegen te gaan. De oplossing waarmee zij toen gekomen zijn, _CSS1_, was gericht op de problemen waar men in die tijd tegenaan liep.

De designproblemen van de moderne webontwikkelaar zijn heel anders dan die van ontwikkelaars in 1994 &mdash; en met alle bagage van onhandige/onnodige features die erbij geplakt zijn om te komen tot CSS3 kun je haast door de bomen het bos niet meer zien.

<br/>

### ✂️ Separation of Concerns

Wanneer je een HTML document opmaakt, wordt vaak gezegd dat je de HTML (markup) en de CSS (styling) moet scheiden, maar waarom eigenlijk?

Volgens de methodologie _Separation of Concerns_ (SoC), moet je je code scheiden op basis van "concern", ofwel _zorgen_. Als je bezig bent met een HTML-documentje zou je je geen _zorgen_ hoeven maken om het uiterlijk van dat document. Daar is natuurlijk heel handig, maar daar zit de crux: het maken van een website bestaat niet uit de twee magische stappen "markup" en "styling", maar uit veel meer facetten!

De twee facetten die van toepassing zijn bij het maken van een onderhoudbare website zijn _styling_ en _layout_; dat zijn namelijk verschillende dingen. De markup van een document zou geen betekenisvolle zorg moeten zijn om te scheiden. Er zijn veel verschillende pogingen gedaan om CSS onder controle te krijgen ([Atomic CSS](https://tailwindcss.com/), [SMACSS](http://smacss.com/), [BEM](https://getbem.com/introduction/), etc.), maar al deze oplossingen proberen de symptomen weg te werken in plaats van het onderliggende probleem op te lossen:

<br/>

> **_Style en layout zijn niet hetzelfde._**

<br/>

_ℹ️ Als je hier graag meer over wil leren, kun je deze [interessante talk door Matthew Griffith over hetzelfde onderwerp](https://www.youtube.com/watch?v=NYb2GDWMIm0) bekijken/-luisteren._

<br/>

<blockquote>
<b>"We buy into the idea that responsiveness is mostly about layout, so then it kind of follows that responsiveness should be in the view too."</b> - Matthew Griffith, Author of elm-ui.
</blockquote>

<br/>

### 🏗️🆚🎨 Layout vs. Styling

Layout en styling worden allebei geregeld in CSS, waardoor het moeilijk is om dat gescheiden te houden. Met hulp van Typescript en React hebben wij een in-house library ontwikkeld waarmee wij onze layout regelen _samen met de markup_. Markup en layout vormen samen namelijk de _hierarchie_ die je met CSS heel makkelijk kunt opmaken.

Wat overblijft om in CSS te doen zijn kleurtjes, borders, hover states etc. Dit is precies waar CSS heel sterk in is.

De classes voor layout en daaraan gebonden CSS hebben we verwerkt in de componenten in de Layout map. Een groot voordeel van React met Typescript is dat we nu zelfs onze layout kunnen typen!

<br/>

## 📦 Flexbox

Bijna elke layout die je kunt bedenken valt op te bouwen uit rijen en kolommen (Engels: Rows & Columns). Dit hadden de pioniers van het internet al in de gaten, en hebben dat opgelost met _tabellen_; maar dat was natuurlijk niet werkbaar. [Sinds 2015 kunnen we met Flexbox dezelfde layouts realiseren](https://annairish.github.io/historicizing/history) zonder daarvoor tabellen te hoeven gebruiken en de eigenaardigheden die daarbij horen.

<br/>

### 🧱 Columns & Rows

[Flexbox layout bestaat uit een aantal simpele concepten](https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Flexbox). Het belangrijkste daarvan zijn de voornoemde _Rows_ en _Columns_. De twee belangrijkste componenten van de Layout library zijn dan ook de [`Row`](./row.tsx) en [`Column`](./column.tsx).

Een Column is een layout waarin children horizontaal worden uitgelijnd. Lees je in over Flexbox en [bekijk de uitgebreide documentatie over `FlexDirection.Column`](./flex.ts).

Een Row is een layout waarin children verticaal worden uitgelijnd. Lees je in over Flexbox en [bekijk de uitgebreide documentatie over `FlexDirection.Row`](./flex.ts).

<br/>

### 🤏 Gap, margin of padding

De manier hoe de `width` en `height` worden berekend van een CSS element hangt af van zijn `box-sizing`. In onze projecten maken we gebruik van het "alternatieve" `box-model`: `border-box`. Dit model werkt zoals de meeste mensen zouden verwachten dat het werkt: de `border`, `padding` en de content worden meegerekend, maar `margin` niet. Voor meer informatie, [bekijk deze uitgebreide technische uitleg over het `box-model`](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/The_box_model#margins_padding_and_borders).

Om ruimte tussen elementen te maken, zou je normaliter `margin` gebruiken, maar in onze flexbox layout doe je dat met `gap`. De crux zit in de naam: met `gap` bepaal je de afstand _tussen_ items in een container. Op deze manier hoef je geen ingewikkelde CSS-selectoren in te zetten.

![](https://css-tricks.com/wp-content/uploads/2020/08/DKNteyUQ.png)

- `gap` is voor ruimte tussen items in een container.
- `margin` is voor ruimte om één specifiek element heen.
- `padding` is voor ruimte tussen de border en de content van één specifiek element.

<br/>

## 🏁 Klaar

Top, we zijn er! Nu kun je &mdash; bewapend met verse kennis 🧠 &mdash; lijpe layouts in elkaar tikken.

Als je ergens niet uitkomt kun je natuurlijk iemand van Chippr aanspreken, dan helpen we even mee.

<br/>
<br/>

<div align="center">
  <a href="https://chippr.dev">
    <img src="../assets/images/chippr.svg" width="100px"/>
  </a>
</div>
