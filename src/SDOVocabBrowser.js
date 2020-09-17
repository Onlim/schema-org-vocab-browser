const SDOAdapter = require('schema-org-adapter');
const util = require('./util.js');

const TYPES = {
    VOCAB: 'VOCAB',
    LIST: 'LIST'
};

class SDOVocabBrowser {
    constructor(elem, vocabOrVocabList, type = TYPES.VOCAB) {
        this.elem = elem;
        this.vocabOrVocabList = vocabOrVocabList;
        this.type = type;

        window.addEventListener('popstate', async (e) => {
            await this.generateHTML();
        });
    }

    async init() {
        // Init list
        if (this.listNeedsInit()) {
            let jsonString;
            if (util.isValidUrl(this.vocabOrVocabList)) {
                jsonString = await util.get(this.vocabOrVocabList);
            } else {
                jsonString = this.vocabOrVocabList;
            }
            this.list = JSON.parse(jsonString)
        }

        // Init vocab
        if (this.vocabNeedsInit()) {
            await this.initVocab();
        }
    }

    listNeedsInit() {
        return (this.type === TYPES.LIST && !this.list);
    }

    vocabNeedsInit() {
        const searchParams = new URLSearchParams(window.location.search);
        const listNumber = searchParams.get('voc');
        return ((this.type === TYPES.LIST && listNumber && listNumber !== this.listNumber) ||
            (this.type === TYPES.VOCAB && !this.vocabs));
    }

    isListRendering() {
        const searchParams = new URLSearchParams(window.location.search);
        return (this.type === TYPES.LIST && !searchParams.get('voc'));
    }

    isVocabRendering() {
        const searchParams = new URLSearchParams(window.location.search);
        return ((this.type === TYPES.LIST && searchParams.get('voc') && !searchParams.get('term')) ||
            (this.type === TYPES.VOCAB && !searchParams.get('term')));
    }

    isTermRendering() {
        const searchParams = new URLSearchParams(window.location.search);
        return searchParams.get('term');
    }

    async initVocab() {
        let vocab;
        if (this.type === TYPES.VOCAB) {
            vocab = this.vocabOrVocabList;
        } else if (this.type === TYPES.LIST) {
            const searchParams = new URLSearchParams(window.location.search);
            this.listNumber = searchParams.get('voc');
            vocab = this.list['schema:hasPart'][this.listNumber - 1]['@id'];
        }

        this.sdoAdapter = new SDOAdapter();
        const sdoURL = await this.sdoAdapter.constructSDOVocabularyURL('latest', 'all-layers');
        // JSON or URL can both be parsed
        await this.sdoAdapter.addVocabularies([sdoURL, vocab]);

        this.vocabs = this.sdoAdapter.getVocabularies(vocab);
        delete this.vocabs['schema'];
        const vocabNames = Object.keys(this.vocabs);

        this.classes = this.sdoAdapter.getListOfClasses({fromVocabulary: vocabNames});
        this.properties = this.sdoAdapter.getListOfProperties({fromVocabulary: vocabNames});
        this.enumerations = this.sdoAdapter.getListOfEnumerations({fromVocabulary: vocabNames});
        this.enumerationMembers = this.sdoAdapter.getListOfEnumerationMembers({fromVocabulary: vocabNames});
        this.dataTypes = this.sdoAdapter.getListOfDataTypes({fromVocabulary: vocabNames});
    }

    async generateHTML() {
        await this.init();

        if (this.isListRendering()) {
            this.generateList();
        } else if (this.isVocabRendering()) {
            this.generateVocab();
        } else if (this.isTermRendering()) {
            this.generateTerm();
        }
    }

    generateTerm() {
        const searchParams = new URLSearchParams(window.location.search);
        this.term = this.sdoAdapter.getTerm(searchParams.get('term'));

        let html;
        if (this.term.getTermType() === 'rdfs:Class') {
            html = '<div id="mainContent" ' + /*vocab="http://schema.org/"*/ +'typeof="rdfs:Class" resource="' + window.location + '">' +
                this.generateClassHeader() +
                this.generateClassProperties() +
                '</div>';
        }

        this.elem.innerHTML = html;
        this.addTermEventListener();
    }

    generateClassHeader() {
        const termIRI = this.term.getIRI(true);
        let html = '<h1 property="rdfs:label" class="page-title">' + termIRI + '</h1>' +
            '<h4>' +
            '<span class="breadcrumbs">';

        const superClasses = this.term.getSuperClasses();
        if (superClasses) {
            superClasses.reverse().forEach((superClass, i) => {
                if (this.classes.includes(superClass)) {
                    if ((i + 1) === superClasses.length) {
                        html += '<link property="rdfs:subClassOf" href="' + util.createIRIwithQueryParam('term', superClass) + '">';
                    }
                    html += util.createJSLink('a-term-name', 'term', superClass);
                } else {
                    const href = this.sdoAdapter.getClass(superClass).getIRI();
                    if ((i + 1) === superClasses.length) {
                        html += '<link property="rdfs:subClassOf" href="' + href + '">';
                    }
                    html += '<a href="' + href + '" target="_blank">' + superClass + '</a>';
                }
                html += ' > ';
            });
        }

        html += util.createJSLink('a-term-name', 'term', termIRI) +
            '</span>' +
            '</h4>' +
            '<div property="rdfs:comment">' + this.term.getDescription() + '<br><br></div>';
        return html;
    }

    generateClassProperties() {
        let html = '' +
            '<table class="definition-table">' +
            '<thead>' +
            '<tr>' +
            '<th>Property</th>' +
            '<th>Expected Type</th>' +
            '<th>Description</th>' +
            '</tr>' +
            '</thead>';

        const classes = [this.term, ...this.term.getSuperClasses().map((c) => this.sdoAdapter.getClass(c))];
        classes.forEach((c) => {
            const properties = c.getProperties(false);
            if (properties.length !== 0) {
                html += '<tbody><tr class="supertype"><th colspan="3">Properties from ' + c.getIRI(true) + '</th></tr></tbody>';
                // TODO
            }
        });
        html += '</table>';
        return html;
    }

    generateVocab() {
        this.elem.innerHTML =
            '<div id="mainContent"' + /*vocab="http://schema.org/" + ' typeof="rdfs:Class"*/ +' resource="' + window.location + '">' +
            this.generateVocabHeading() +
            this.generateVocabContentSection() +
            this.generateVocabSection(this.classes, 'Class', 'Classes') +
            this.generateVocabSection(this.properties, 'Property', 'Properties') +
            this.generateVocabSection(this.enumerations, 'Enumeration', 'Enumerations') +
            this.generateVocabSection(this.enumerationMembers, 'Enumeration Member', 'Enumeration Members') +
            this.generateVocabSection(this.dataTypes, 'Data Type', 'Data Types') +
            '</div>';
        this.addTermEventListener();
    }

    generateVocabHeading() {
        return '' +
            '<h1>' +
            Object.entries(this.vocabs).map((vocab) => {
                return vocab[0] + ':' + vocab[1]
            }) +
            '</h1>';
    }

    generateVocabContentSection() {
        let html = '<h2>Content</h2>' +
            '<ul>';

        if (this.classes.length !== 0) {
            html += '<li>' + this.classes.length + ' Class' + (this.classes.length === 1 ? '' : 'es') + '</li>';
        }

        if (this.properties.length !== 0) {
            html += '<li>' + this.properties.length + ' Propert' + (this.properties.length === 1 ? 'y' : 'ies') + '</li>';
        }

        if (this.enumerations.length !== 0) {
            html += '<li>' + this.enumerations.length + ' Enumeration' + (this.enumerations.length === 1 ? '' : 's') + '</li>';
        }

        if (this.enumerationMembers.length !== 0) {
            html += '<li>' + this.enumerationMembers.length + ' Enumeration Member' + (this.enumerationMembers.length === 1 ? '' : 's') + '</li>';
        }

        if (this.dataTypes.length !== 0) {
            html += '<li>' + dataTypes.length + ' Data Type' + (this.dataTypes.length === 1 ? '' : 's') + '</li>';
        }

        html += '</ul>';
        return html;
    }

    generateVocabSection(objects, typeSingular, typePlural) {
        let html = '';
        if (objects.length !== 0) {
            html += '' +
                '<h2>' + typePlural + '</h2>' +
                '<table class="definition-table">' +
                '<thead>' +
                '<tr>' +
                '<th>' + typeSingular + '</th>' +
                '<th>Description</th>' +
                '</tr>' +
                '</thead>' +
                '<tbody class="supertype">' +
                this.generateVocabTbody(objects) +
                '</tbody>' +
                '</table>'
        }

        return html;
    }

    generateVocabTbody(objects) {
        return objects.map((name) => {
            const term = this.sdoAdapter.getTerm(name);
            return '' +
                '<tr typeof="' + term.getTermType() + '" resource="' + util.createIRIwithQueryParam('term', name) + '">' +
                '<th scope="row">' +
                '<code property="@id">' +
                util.createJSLink('a-term-name', 'term', name) +
                '</code>' +
                '</th>' +
                '<td property="rdfs:comment">' + term.getDescription() + '</td>' +
                '</tr>'
        }).join('');
    }

    generateListTable() {
        return '' +
            '<table class="definition-table">' +
            '<thead>' +
            '<tr>' +
            '<th>Name</th>' +
            '<th>IRI</th>' +
            '<th>Author</th>' +
            '<th>Description</th>' +
            '</tr>' +
            '</thead>' +
            '<tbody class="supertype">' +
            this.generateListTbody() +
            '</tbody>' +
            '</table>'
    }

    generateListTbody() {
        return this.list['schema:hasPart'].map((vocab, i) => {
            return '' +
                '<tr typeof="http://vocab.sti2.at/ds/Vocabulary" resource="' + util.createIRIwithQueryParam('voc', i + 1) + '">' +
                '<th scope="row">' +
                '<code property="schema:name">' +
                util.createJSLink('a-vocab-name', 'voc', i + 1, 'TODO') +
                '</code>' +
                '</th>' +
                '<td property="@id"><a target="_blank" href="' + vocab['@id'] + '">' + vocab['@id'] + '</a></td>' +
                '<td property="schema:author">' + /*TODO: vocab.author + */ '</td>' +
                '<td property="schema:description">' + /*TODO: vocab.description + */ '</td>' +
                '</tr>';
        }).join('');
    }

    addTermEventListener() {
        const aTermNames = document.getElementsByClassName('a-term-name');

        for (const aTermName of aTermNames) { // forEach() not possible ootb for HTMLCollections
            aTermName.addEventListener('click', async () => {
                history.pushState(null, null, util.createIRIwithQueryParam('term', aTermName.innerText));
                await this.generateHTML();
            });
        }
    }

    generateList() {
        this.elem.innerHTML = '' +
            '<div id="mainContent"' + /*vocab="http://schema.org/" + ' typeof="rdfs:Class"*/ +' resource="' + window.location + '">' +
            this.generateListHeader() +
            this.generateListTable() +
            '</div';
        this.addListEventListener();
    }

    generateListHeader() {
        return '<h1>' + this.list['schema:name'] + '</h1>';
    }

    addListEventListener() {
        const aVocabNames = document.getElementsByClassName('a-vocab-name');

        for (let i = 0; i < aVocabNames.length; i++) { // forEach() not possible ootb for HTMLCollections
            const aVocabName = aVocabNames[i];
            aVocabName.addEventListener('click', async () => {
                history.pushState(null, null, util.createIRIwithQueryParam('voc', i + 1));
                await this.generateHTML();
            });
        }
    }
}

module.exports = SDOVocabBrowser;