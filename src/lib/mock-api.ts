import { choose, random, range, unique, wait } from "lib/utils";

type Article = Readonly<{
	id: string;
	title: string;
	img: string;
	excerpt: string;
	content: ReadonlyArray<string>;
	lastUpdatedAt: Date;
	authors: ReadonlyArray<Author>;
	tags: ReadonlyArray<string>;
}>;

type Author = Readonly<{
	name: string;
	handle: string;
	img: string;
}>;

const hex = () => random(16).toString(16);

const id = () => range(32).map(hex).join("");

const pick =
	<T, K extends keyof T>(props: K | ReadonlyArray<K>) =>
	(target: T) => {
		const keys = [props].flat() as ReadonlyArray<K>;
		return Object.fromEntries(keys.map(k => [k, target[k]])) as Pick<T, K>;
	};

const authors: ReadonlyArray<Author> = [
	{
		name: "Gert Verhulst",
		handle: "@The_real_GERTJEEE",
		img: "https://images0.persgroep.net/rcs/vUzpxzFeMCJvC1oinwUununRAnA/diocontent/220123004/_fitwidth/694/?appId=21791a8992982cd8da851550a453bd7f&quality=0.8",
	},
	{
		name: "Jeroen van der Boom",
		handle: "@JEROEEEM",
		img: "https://www.bekendeartiestboeken.nl/wp-content/uploads/elementor/thumbs/Jeroen-Van-Der-Boom-boeken-p6a3mha4agctyp12iya13bxpipjag8cjt3vmknzd0g.jpg",
	},
	{
		name: "Kysia Hekster",
		handle: "@kysia",
		img: "https://images0.persgroep.net/rcs/iPaVJmz1dxoPQGSIE_UTQqiz__g/diocontent/207346666/_fitwidth/1240?appId=93a17a8fd81db0de025c8abd1cca1279&quality=0.9",
	},
];

const tags = [
	"Taarten",
	"Wasbeertjes",
	"Computerspellen",
	"Anime",
	"Bosbessen",
	"Haute Couture",
	"Entrecôte",
];

const articles: Article[] = [
	{
		id: id(),
		title:
			"Prijzige eekhoorn\u00ADbrug inmiddels door 3 knaag\u00ADdieren gebruikt",
		img: "https://images0.persgroep.net/rcs/3jt4kOH9aJWHzeU-VV5YTirWlY8/diocontent/62297492/_crop/5/0/1843/1044/_fitwidth/694/?appId=21791a8992982cd8da851550a453bd7f&quality=0.8&desiredformat=webp",
		excerpt:
			"De eekhoornbrug over de Benoordenhoutseweg in Den Haag wordt wel degelijk door eekhoorns gebruikt. Een jaar geleden stak het eerste knaagdier over, inmiddels staat de teller op drie. Nog geen grote aantallen, maar in ieder geval heeft de brug zijn functie bewezen, menen de gemeente en Staatsbosbeheer.",
		content: [
			"Er was veel ophef, begin 2014. De faunaverbinding werd landelijk nieuws. Want 144.000 euro rijksgeld was er gestoken in de verbinding tussen het Haagse Bos en Clingendael. En dat allemaal om te voorkomen dat de overstekende knaagdieren zouden worden doodgereden. En hoeveel van de eekhoorns maakten er gebruik van? Nul.",
			"We zijn nu meer dan een jaar verder en de teller van het aantal gebruikers staat op drie, zo registreerden de camera's. Voldoet de brug daarmee aan de verwachtingen? ,,Wij mensen zijn veel te ongeduldig,'' vindt boswachter Jenny van Leeuwen. ,,Goed beschouwd staat die brug er nog maar net. Dus geef het wat meer tijd.''",
			"Er zijn in ieder geval gunstige ontwikkelingen te melden op dat punt. Staatsbosbeheer, beheerder van het Haagse Bos, is bezig met een inventarisatie van het aantal eekhoornnesten. ,,Op basis van de nesten kunnen we het aantal eekhoorns schatten,'' vertelt Van Leeuwen. ,,En dat ziet er goed uit. Op het dieptepunt waren er twintig eekhoorns in het bos, nu denk ik dat we voorzichtig naar de dertig gaan. En we hebben twee nesten vlak bij de brug gevonden. Het zou dus zomaar kunnen dat als de jongen straks uit het nest moeten ze de brug snel weten te vinden.''",
		],
		lastUpdatedAt: new Date("2015-04-04T07:34:00"),
		authors: unique(range(random(1, 3)).map(() => choose(authors))),
		tags: unique(range(random(2, 5)).map(() => choose(tags))),
	},
	{
		id: id(),
		title:
			"Schilderij van Mon\u00ADdriaan hangt al decennia op zijn kop in Duits museum",
		img: "https://cdn.nos.nl/image/2022/10/27/909538/1280x720a.jpg",
		excerpt:
			"Een van de schilderijen van de Nederlandse schilder Piet Mondriaan heeft tientallen jaren op zijn kop gehangen in het museum Kunstsammlung Nordrhein-Westfalen in Düsseldorf. Dat heeft het Duitse museum onthuld op een persconferentie bij de opening van een tentoonstelling ter ere van de 150ste geboortedag van Mondriaan.",
		content: [
			"Conservator Susanne Meyer-Büser denkt dat er meerdere redenen zijn om aan te nemen dat het schilderij verkeerd hangt.",
			"Het schilderij bestaat uit verschillende horizontale en verticale gekleurde stroken. Op een foto die kort na Mondriaans overlijden in 1944 in zijn atelier is genomen, is het kunstwerk te zien op een schildersezel. De stroken die dichter bij elkaar staan, zitten de bovenkant van het schilderij.",
			"Dat is ook het geval met een bijna identiek schilderij dat in het Centre Pompidou in Parijs hangt.",
			"In het Duitse museum is het schilderij 180 graden gedraaid, waardoor de strepen die dichter bij elkaar zitten, aan de onderkant zitten. Het museum is niet van plan om het kunstwerk om te draaien nu de fout is ontdekt.",
		],
		lastUpdatedAt: new Date("2022-10-27T16:30:00"),
		authors: unique(range(random(1, 3)).map(() => choose(authors))),
		tags: unique(range(random(2, 5)).map(() => choose(tags))),
	},
	{
		id: id(),
		title:
			"Toestel Ethiopian Airlines mist landing, 'piloten sliepen mogelijk'",
		img: "https://cdn.nos.nl/image/2022/08/19/889311/1280x720a.jpg",
		excerpt:
			"Ethiopian Airlines doet onderzoek naar twee piloten die verzuimd hebben een vliegtuig op tijd aan de grond te zetten. Zolang het onderzoek loopt, zijn zij geschorst, meldt de luchtvaartmaatschappij vandaag.",
		content: [
			"Vlucht ET343 vanuit Khartoum in Sudan had in de Ethiopische hoofdstad Addis Abeba moeten landen, maar uit vluchtgegevens blijkt dat het toestel het vliegveld voorbij vloog. Het vliegtuig keerde even verderop om en landde uiteindelijk alsnog.",
			'Volgens luchtvaartwebsite AV Herald waren de piloten in slaap gevallen en werden beide mannen wakker toen de automatische piloot een waarschuwing gaf. Dat bevestigt Ethiopian Airlines niet, maar de vliegmaatschappij geeft wel toe dat de luchtverkeersleiding tijdelijk niet kon communiceren met de piloten. Ethiopian Airlines zegt na het onderzoek te beslissen of "passende corrigerende maatregelen" nodig zijn.',
			"Mocht blijken dat de piloten inderdaad de landing vergeten waren, dan is dat niet de eerste keer in de luchtvaartgeschiedenis. In 2009 vloog een toestel van Northwest Airlines ruim 160 kilometer te ver door in het Amerikaanse luchtruim, voordat het omkeerde en landde in Minneapolis. De piloten bleken afgeleid omdat ze hun persoonlijke laptops erbij hadden gepakt om elkaar een nieuw planningssysteem van hun luchtvaartmaatschappij te tonen.",
			"En eind april van dit jaar zouden twee piloten van het Italiaanse ITA Airways in slaap zijn gevallen toen ze vanaf New York op weg waren naar Rome. Naast de piloot die een slaappauze had, was ook de andere piloot waarschijnlijk in slaap gevallen, meldt ABC.",
		],
		lastUpdatedAt: new Date("2022-08-19T20:30:00"),
		authors: unique(range(random(1, 3)).map(() => choose(authors))),
		tags: unique(range(random(2, 5)).map(() => choose(tags))),
	},
];

const respond =
	<T>(response: T) =>
	() =>
		response;

export const getArticles = () =>
	wait(random(500, 5000)).then(
		respond(
			unique(range(10).map(() => choose(articles))).map(
				pick(["id", "title", "img", "excerpt"])
			)
		)
	);

export const getArticle = (id: string) =>
	wait(random(500, 5000)).then(
		respond(articles.find(article => article.id === id)!)
	);

export const postArticle = (article: Article) => {
	articles.push(article);
	return wait(random(500, 5000)).then(respond(article));
};

export const patchArticle = (id: string, article: Article) => {
	articles.splice(
		articles.findIndex(article => article.id === id),
		1,
		article
	);
	return wait(random(500, 5000)).then(respond(article));
};

export const deleteArticle = (id: string) => {
	articles.splice(
		articles.findIndex(article => article.id === id),
		1
	);
	return wait(random(500, 5000)).then(respond(articles));
};
