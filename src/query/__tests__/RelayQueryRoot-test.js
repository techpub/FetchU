/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+relay
 */

'use strict';

var RelayTestUtils = require('RelayTestUtils');
RelayTestUtils.unmockRelay();

var QueryBuilder = require('QueryBuilder');
var Relay = require('Relay');
var RelayQuery = require('RelayQuery');

describe('RelayQueryRoot', () => {
  var {defer, getNode} = RelayTestUtils;

  var me;
  var usernames;

  beforeEach(() => {
    jest.resetModuleRegistry();

    jest.addMatchers(RelayTestUtils.matchers);

    me = getNode(Relay.QL`
      query {
        me {
          name1: firstName,
          name1: lastName,
        }
      }
    `);

    usernames = getNode(Relay.QL`
      query {
        usernames(names:"mroch") {
          firstName,
        }
      }
    `);
    usernames.__concreteNode__.metadata = {identifyingArgName: 'names'};
  });

  it('has a unique ID', () => {
    var lastID = getNode(Relay.QL`query{me{firstName}}`).getID();
    var nextID = getNode(Relay.QL`query{me{lastName}}`).getID();
    expect(lastID).toMatch(/^q\d+/);
    expect(nextID).toMatch(/^q\d+/);
    expect(nextID).not.toEqual(lastID);
  });

  it('returns children', () => {
    var children = me.getChildren();
    expect(children.length).toBe(3);
    expect(children[0].getSchemaName()).toBe('firstName');
    expect(children[1].getSchemaName()).toBe('lastName');
    expect(children[2].getSchemaName()).toBe('id');
    expect(children[2].isGenerated()).toBe(true);

    children = usernames.getChildren();
    expect(children.length).toBe(3);
    expect(children[0].getSchemaName()).toBe('firstName');
    expect(children[1].getSchemaName()).toBe('id');
    expect(children[1].isGenerated()).toBe(true);
    expect(children[2].getSchemaName()).toBe('__typename');
    expect(children[2].isGenerated()).toBe(true);
  });

  it('returns same object when cloning with same fields', () => {
    var children = me.getChildren();
    expect(me.clone(children)).toBe(me);
    expect(me.clone(children.map(c => c))).toBe(me);
    expect(me.clone(
      [null, children[0], null, children[1], null, children[2], null]
    )).toBe(me);

    children = usernames.getChildren();
    expect(usernames.clone(children)).toBe(usernames);
    expect(usernames.clone(children.map(c => c))).toBe(usernames);
  });

  it('returns null when cloning without fields', () => {
    expect(me.clone([])).toBe(null);
    expect(me.clone([null])).toBe(null);
    expect(usernames.clone([])).toBe(null);
    expect(usernames.clone([null])).toBe(null);
  });

  it('returns new object when cloning with different fields', () => {
    var children = me.getChildren();
    expect(me.clone([children[0], null])).not.toBe(me);
    expect(me.clone([children[0], null, null])).not.toBe(me);
    expect(me.clone([children[0], null, null, null])).not.toBe(me);
  });

  it('clones with updated children', () => {
    var query = getNode(Relay.QL`
      query {
        me {
          firstName,
          lastName
        }
      }
    `);
    var clone = query.clone([query.getChildren()[0]]);
    expect(clone.getChildren().length).toBe(1);
    expect(clone.getChildren()[0].getSchemaName()).toBe('firstName');
    expect(clone.getFieldByStorageKey('lastName')).toBe(undefined);
  });

  it('returns root calls with values', () => {
    expect(me.getIdentifyingArg()).toEqual(undefined);

    expect(usernames.getIdentifyingArg()).toEqual(
      {name: 'names', value: 'mroch'}
    );

    expect(getNode(Relay.QL`
      query {
        usernames(names:["a","b","c"]) {
          firstName
        }
      }
    `).getIdentifyingArg()).toEqual(
      {name: 'names', value: ['a', 'b', 'c']}
    );
  });

  it('returns ref params', () => {
    // non-ref query:
    expect(me.getBatchCall()).toBe(null);

    // ref query:
    var root = getNode({
      ...Relay.QL`
        query {
          node(id: "123") {
            id
          }
        }
      `,
      calls: [QueryBuilder.createCall(
        'id',
        QueryBuilder.createBatchCallVariable('q0', '$.*.actor.id')
      )],
    });
    var batchCall = root.getBatchCall();
    expect(batchCall).toEqual({
      refParamName: 'ref_q0',
      sourceQueryID: 'q0',
      sourceQueryPath: '$.*.actor.id',
    });
  });

  it('is not equal to non-root nodes', () => {
    var fragment = getNode(Relay.QL`
      fragment on Viewer {
        actor {
          id
        }
      }
    `);
    var id = fragment.getChildren()[0].getChildren()[0];
    expect(me.equals(fragment)).toBe(false);
    expect(me.equals(id)).toBe(false);
  });

  it('is not equal to queries with different root calls', () => {
    var diffRoot = getNode(Relay.QL`
      query {
        usernames(names:"joesavona") {
          firstName
        }
      }
    `);
    expect(usernames.equals(diffRoot)).toBe(false);
  });

  it('equals the same query', () => {
    expect(usernames.equals(usernames)).toBe(true);
    expect(me.equals(me)).toBe(true);
  });

  it('equals equivalent queries', () => {
    var me2 = getNode(Relay.QL`
      query {
        me {
          name1: firstName,
          name1: lastName,
        }
      }
    `);

    var usernames2 = getNode(Relay.QL`
      query {
        usernames(names:"mroch") {
          firstName,
        }
      }
    `);
    usernames2.__concreteNode__.metadata = {identifyingArgName: 'names'};

    expect(me.equals(me2)).toBe(true);
    expect(usernames.equals(usernames2)).toBe(true);
    expect(me2.equals(me)).toBe(true);
    expect(usernames2.equals(usernames)).toBe(true);
  });

  it('does not equal different queries with the same root', () => {
    var me2 = getNode(Relay.QL`
      query {
        me {
          name1: firstName,
          lastName,
        }
      }
    `);

    var usernames2 = getNode(Relay.QL`
      query {
        usernames(names:"mroch") {
          firstName,
          lastName
        }
      }
    `);
    expect(me.equals(me2)).toBe(false);
    expect(usernames.equals(usernames2)).toBe(false);
    expect(me2.equals(me)).toBe(false);
    expect(usernames2.equals(usernames)).toBe(false);
  });

  it('equals identical ref queries with matching ref params', () => {
    var node = getNode({
      ...Relay.QL`query { node(id: "123") }`,
      calls: [QueryBuilder.createCall(
        'id',
        QueryBuilder.createBatchCallVariable('q0', '$.*.actor.id')
      )],
    });
    var other = getNode({
      ...Relay.QL`query { node(id: "123") }`,
      calls: [QueryBuilder.createCall(
        'id',
        QueryBuilder.createBatchCallVariable('q0', '$.*.actor.id')
      )],
    });
    expect(node.equals(other)).toBe(true);
  });

  it('does not equal queries with different ref params', () => {
    var node = getNode({
      ...Relay.QL`query { node(id: "123") }`,
      calls: [QueryBuilder.createCall(
        'id',
        QueryBuilder.createBatchCallVariable('q0', '$.*.actor.id')
      )],
    });
    var other = getNode({
      ...Relay.QL`query { node(id: "123") }`,
      calls: [QueryBuilder.createCall(
        'id',
        QueryBuilder.createBatchCallVariable(
          'q0',
          '$.*.actor.current_city.id'
        )
      )],
    });
    expect(node.equals(other)).toBe(false);
  });

  it('is not a ref query dependency', () => {
    expect(me.isRefQueryDependency()).toBe(false);
  });

  it('is not generated', () => {
    expect(me.isGenerated()).toBe(false);
  });

  it('is not scalar', () => {
    // query with children
    expect(me.isScalar()).toBe(false);

    // empty query
    var query = getNode({
      ...Relay.QL`query { viewer }`,
      children: [],
    });
    expect(query.isScalar()).toBe(false);
  });

  it('returns the identifying argument type', () => {
    var nodeQuery = getNode(Relay.QL`query{node(id:"123"){id}}`);
    nodeQuery.__concreteNode__.metadata = {
      identifyingArgName: 'id',
      identifyingArgType: 'scalar',
    };
    const nodeIdentifyingArg = nodeQuery.getIdentifyingArg();
    expect(nodeIdentifyingArg).toBeDefined();
    expect(nodeIdentifyingArg.type).toBe('scalar');

    var me = getNode(Relay.QL`query{me{id}}`);
    const meIdentifyingArg = me.getIdentifyingArg();
    expect(meIdentifyingArg).toBeUndefined();
  });

  it('creates nodes', () => {
    var query = getNode(Relay.QL`
      query {
        viewer {
          actor {
            id
          }
        }
      }
    `);
    var node = Relay.QL`
      fragment on Viewer {
        actor {
          id
        }
      }
    `;
    var actorID = query.createNode(node);
    expect(actorID instanceof RelayQuery.Fragment).toBe(true);
    expect(actorID.getType()).toBe('Viewer');
    expect(actorID.getRoute()).toBe(query.getRoute());
    expect(actorID.getVariables()).toBe(query.getVariables());
  });

  it('returns deferred fragment names if present', () => {
    var fragment2 = Relay.QL`
      fragment on User {
        name,
      }
    `;
    var fragment1a = Relay.QL`
      fragment on User {
        id,
        ${defer(fragment2)},
      }
    `;
    var fragment1b = Relay.QL`
      fragment on User {
        id,
        ${defer(fragment2)},
      }
    `;
    var query = getNode(Relay.QL`
      query {
        viewer {
          actor {
            ${defer(fragment1a)},
            ${Relay.QL`
              fragment on User {
                ${defer(fragment1b)},
              }
            `}
          }
        }
      }
    `);
    // nested deferred fragment names are not included
    var expected = {};
    var fragment1aID = getNode(fragment1a).getFragmentID();
    var fragment1bID = getNode(fragment1b).getFragmentID();
    expected[fragment1aID] = fragment1aID;
    expected[fragment1bID] = fragment1bID;
    expect(query.getDeferredFragmentNames()).toEqual(expected);

    query = getNode(Relay.QL`
      query {
        me {
          id
        }
      }
    `);
    expect(query.getDeferredFragmentNames()).toEqual({});
  });

  it('returns directives', () => {
    var query = getNode(Relay.QL`
      query {
        me @include(if: $cond) {
          id
        }
      }
    `, {cond: true});
    expect(query.getDirectives()).toEqual([
      {
        name: 'include',
        arguments: [
          {name: 'if', value: true},
        ],
      }
    ]);
  });

  describe('getStorageKey()', () => {
    it('delegates to RelayQueryField::getStorageKey', () => {
      const query = getNode(Relay.QL`query { settings(environment: MOBILE) }`);
      // Inherit all of the other RelayQueryField::getStorageKey() behavior,
      // like stripping out spurious if/unless and connection args.
      const mockField = {getStorageKey: jest.genMockFunction()};
      RelayQuery.Field.build = jest.genMockFn().mockReturnValue(mockField);
      query.getStorageKey();
      expect(RelayQuery.Field.build).toBeCalled();
      expect(mockField.getStorageKey).toBeCalled();
    });

    it('strips identifying arguments', () => {
      const identifyingQuery = getNode(
        Relay.QL`query { username(name:"yuzhi") }`
      );
      identifyingQuery.__concreteNode__.metadata = {identifyingArgName: 'name'};
      expect(identifyingQuery.getStorageKey()).toBe('username');
    });

    /*
    Come a time when root fields support more than just identifying arguments,
    write a test to ensure that non-identifying args don't get stripped out.

    it('does not strip out non-identifying arguments', () => {
      const query = getNode(Relay.QL`query { settings(environment: MOBILE) }`);
      expect(query.getStorageKey()).toBe('settings.environment(MOBILE)');
    });
    */
  });
});
