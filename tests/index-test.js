'use strict';
/* globals QUnit */

const describe = QUnit.module;
const it = QUnit.test;
const babel = require('@babel/core');
const Plugin = require('../src');
const mapping = require('@ember-data/rfc395-data');

function transform(source, _plugins) {
  let plugins = _plugins || [
    [Plugin],
  ];
  let result = babel.transformSync(source, {
    plugins,
  });

  return result.code;
}

function matches(source, expected, only) {
  (only ? QUnit.only : it)(`${source}`, assert => {
    let actual = transform(source).replace(/\n/g, '');
    let realExpected = expected.replace(/\n/g, '');

    assert.equal(actual, realExpected);
  });
}

function testMatch(definition, global) {
  let importName = definition.export || 'default';
  let importRoot = definition.module;
  const varName = importName === 'default' ? 'defaultModule' : importName;
  const localName = varName === 'defaultModule' ? varName : `{ ${varName} }`;

  matches(
    `import ${localName} from '${importRoot}';var _x = ${varName}`,
    `import DS from "ember-data";var _x = ${global};`
  );
}

// Ensure each of the config mappings is mapped correctly
describe(`ember-data-packages-polyfill | Mappings`, () => {
  mapping.forEach(exportDefinition => {
    testMatch(exportDefinition, exportDefinition.global);

    if (exportDefinition.replacement) {
      testMatch(exportDefinition.replacement, exportDefinition.global);
    }
  });
});

// Ensure it works in complex scopes
describe(`ember-data-packages-polyfill | import-complex-scopes`, () => {
  matches(
    `import { attr } from '@ember-data/model';
var _x = someArray.every(item => attr(item));
var _y = someOtherArray.some((attr, idx) => attr(idx));`,
    `import DS from "ember-data";
var _x = someArray.every(item => DS.attr(item));
var _y = someOtherArray.some((attr, idx) => attr(idx));`
  );
});

// Ensure we don't insert an unnecessary import
describe(`ember-data-packages-polyfill | no-mapped-import`, () => {
  matches(
    `import Ember from 'ember';`,
    `import Ember from 'ember';`
  );
});

// Ensure mapping without reference just leaves us with the DS import
describe(`ember-data-packages-polyfill | import-without-reference`, () => {
  matches(
    `import Model, { attr } from '@ember-data/model';
import Adapter from '@ember-data/adapter';`,
    `import DS from "ember-data";`
  );
});

// Ensure mapping multiple imports makes multiple variables
describe(`ember-data-packages-polyfill | import-multiple`, () => {
  matches(
    `import Model, { attr, belongsTo } from '@ember-data/model';var _x = Model;var _y = attr;var _z = belongsTo;`,
    `import DS from "ember-data";var _x = DS.Model;var _y = DS.attr;var _z = DS.belongsTo;`
  );
});

// Ensure mapping a named aliased import
describe(`ember-data-packages-polyfill | named-as-alias`, () => {
  matches(
    `import { attr as DataAttr } from '@ember-data/model';var _x = DataAttr;`,
    `import DS from "ember-data";var _x = DS.attr;`
  );
});

// Ensure mapping a named and aliased import makes multiple named variables
describe(`ember-data-packages-polyfill | import-named-multiple`, () => {
  matches(
    `import { attr, belongsTo as foo } from '@ember-data/model';var _x = attr;var _y = foo;`,
    `import DS from "ember-data";var _x = DS.attr;var _y = DS.belongsTo;`
  );
});

// Ensure mapping the default as an alias works
describe(`ember-data-packages-polyfill | default-as-alias`, () => {
  matches(
    `import { default as foo } from '@ember-data/model';var _x = foo;`,
    `import DS from "ember-data";var _x = DS.Model;`
  );
});

// Ensure reexporting things works
describe(`ember-data-packages-polyfill | reexport`, () => {
  matches(
    `export { default } from '@ember-data/store';`,
    `import DS from "ember-data";export default DS.Store;`
  );

  matches(
    `export { default as Store } from '@ember-data/store';`,
    `import DS from "ember-data";export var Store = DS.Store;`
  );

  matches(
    `export { belongsTo } from '@ember-data/model';`,
    `import DS from "ember-data";export var belongsTo = DS.belongsTo;`
  );

  matches(
    `export { belongsTo as foo } from '@ember-data/model';`,
    `import DS from "ember-data";export var foo = DS.belongsTo;`
  );

  matches(
    `export var foo = 42;`,
    `export var foo = 42;`
  );

  it(`throws an error for wildcard imports`, assert => {
    let input = `import * as Modeling from '@ember-data/model';`;

    assert.throws(() => {
      transform(input, [
        [Plugin],
      ]);
    }, 'Using `import * as Modeling from \'@ember-data/model\'` is not supported');
  });

  it(`throws an error for wildcard imports from ember-data`, assert => {
    let input = `import * as DS from 'ember-data';`;

    assert.throws(() => {
      transform(input, [
        [Plugin],
      ]);
    }, 'Using `import * as DS from \'ember-data\'` is not supported');
  });

  it(`throws an error for wildcard exports`, assert => {
    let input = `export * from '@ember-data/model';`;

    assert.throws(() => {
      transform(input, [
        [Plugin],
      ]);
    }, /Wildcard exports from @ember-data\/model are currently not possible/);
  });

  matches(
    `export * from 'foo';`,
    `export * from 'foo';`
  );
});

// Ensure unknown exports are not removed
describe(`unknown imports from known module`, () => {
  it(`allows excluding import paths`, assert => {
    let input = `import { derp } from '@ember-data/model';`;

    assert.throws(() => {
      transform(input, [
        [Plugin],
      ]);
    }, /@ember-data\/model does not have a derp export/);
  });
});

describe(`import then export`, () => {
  matches(
    `import { attr } from '@ember-data/model';
export { attr };`,
    `import DS from "ember-data";var attr = DS.attr;export { attr };`
  );

  matches(
    `import { attr, belongsTo } from '@ember-data/model';
    attr("a thing");
    belongsTo("another thing");
    export { belongsTo };`,
    `import DS from "ember-data";
var belongsTo = DS.belongsTo;
DS.attr("a thing");
belongsTo("another thing");
export { belongsTo };`
  );
});

describe('options', () => {
  describe('disallowedList', () => {
    it(`allows disallowing import paths`, assert => {
      let input = `import Model, { attr } from '@ember-data/model';`;
      let actual = transform(input, [
        [Plugin, { disallowedList: ['@ember-data/model'] }],
      ]);

      assert.equal(actual, input);
    });

    it(`allows disallowing specific named imports`, assert => {
      let input = `import Model, { attr, belongsTo } from '@ember-data/model';import Store from '@ember-data/store';var _x = Model;var _y = attr;`;
      let actual = transform(input, [
        [Plugin, { disallowedList: { '@ember-data/model': ['belongsTo'], '@ember-data/store': ['default'] } }],
      ]);
      let expected = `import DS from "ember-data";
import { belongsTo } from '@ember-data/model';
import Store from '@ember-data/store';
var _x = DS.Model;
var _y = DS.attr;`;

      assert.equal(actual, expected);
    });

    it('does not error when a disallowedList is not present', assert => {
      let input = `import { attr, belongsTo } from '@ember-data/model';var _x = attr;var _y = belongsTo;`;
      let actual = transform(input, [
        [Plugin, { disallowedList: { } }],
      ]);
      let expected = `import DS from "ember-data";
var _x = DS.attr;
var _y = DS.belongsTo;`;

      assert.equal(actual, expected);
    });
  });
});

describe(`import from 'ember-data'`, () => {
  matches(
    `import DS from 'ember-data';var _x = DS;`,
    `import DS from 'ember-data';var _x = DS;`
  );
  matches(
    `import D from 'ember-data';var _x = D;`,
    `import DS from 'ember-data';var _x = DS;`
  );
  matches(
    `import './foo';`,
    `import './foo';`
  );
});

describe(`import without specifier is removed`, () => {
  matches(
    `import 'ember-data';`,
    ``
  );
  matches(
    `import '@ember-data/model';`,
    ``
  );
});

