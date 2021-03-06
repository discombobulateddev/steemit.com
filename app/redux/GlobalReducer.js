import {Map, Set, List, fromJS, Iterable} from 'immutable';
import createModule from 'redux-modules';
import {PropTypes} from 'react';
import {emptyContent} from 'app/redux/EmptyState';
import constants from './constants';

const {string, object, bool, array, oneOf, oneOfType, func, any} = PropTypes

export default createModule({
    name: 'global',
    initialState: Map({status: {}}),
    transformations: [
        {
            action: 'SET_COLLAPSED',
            reducer: (state, action) => {
                return state.withMutations(map => {
                    map.updateIn(['content', action.payload.post], value => {
                        value.merge(Map({collapsed: action.payload.collapsed}));
                    });
                });
            }
        },
        {
            action: 'RECEIVE_STATE',
            // payloadTypes: { },
            reducer: (state, action) => {
                // console.log('RECEIVE_STATE');
                // console.log('state.mergeDeep(action.payload).toJS(), action.payload', state.mergeDeep(action.payload).toJS(), action.payload)
                return state.mergeDeep(action.payload);
            }
        },
        {
            action: 'RECEIVE_ACCOUNT',
            payloadTypes: {
                account: object.isRequired,
            },
            reducer: (state, {payload: {account}}) => {
                account = fromJS(account, (key, value) => {
                    if (key === 'witness_votes') return value.toSet()
                    const isIndexed = Iterable.isIndexed(value);
                    return isIndexed ? value.toList() : value.toOrderedMap();
                })
                // Merging accounts: A get_state will provide a very full account but a get_accounts will provide a smaller version
                return state.updateIn(['accounts', account.get('name')], Map(), a => a.mergeDeep(account))
            }
        },
        {
            action: 'RECEIVE_COMMENT',
            payloadTypes: {
                author: string.isRequired,
                permlink: string.isRequired,
                body: object.isRequired, // Buffer
                title: object, // Buffer
                parent_permlink: string,
                parent_author: string,
            },
            reducer: (state, {payload: op}) => {
                const {author, permlink, parent_author = '', parent_permlink = '', title = '', body} = op
                const key = author + '/' + permlink

                let updatedState = state.updateIn(['content', key], Map(emptyContent), r => r.merge({
                    author, permlink, parent_author, parent_permlink,
                    title: title.toString('utf-8'),
                    body: body.toString('utf-8'),
                }))
                // console.log('updatedState content', updatedState.getIn(['content', key]).toJS())

                if (parent_author !== '' && parent_permlink !== '') {
                    const parent_key = parent_author + '/' + parent_permlink
                    updatedState = updatedState.updateIn(['content', parent_key, 'replies'], List(), r => r.insert(0, key))
                    // console.log('updatedState parent', updatedState.toJS())
                }
                return updatedState
            }
        },
        {
            action: 'RECEIVE_CONTENT',
            payloadTypes: {
                content: object.isRequired, // full content object (replace from the blockchain)
            },
            reducer: (state, {payload: {content}}) => {
                content = fromJS(content)
                const key = content.get('author') + '/' + content.get('permlink')
                return state.updateIn(['content', key], Map(), c => {
                    c = c.delete('active_votes')
                    return c.mergeDeep(content)
                })
            }
        },
        { // works...
            action: 'LINK_REPLY',
            payloadTypes: {
                author: string.isRequired,
                permlink: string.isRequired,
                parent_permlink: string,
                parent_author: string,
            },
            reducer: (state, {payload: op}) => {
                const {author, permlink, parent_author = '', parent_permlink = ''} = op
                if (parent_author === '' || parent_permlink === '') return state
                const key = author + '/' + permlink
                const parent_key = parent_author + '/' + parent_permlink
                // Add key if not exist
                return state.updateIn(['content', parent_key, 'replies'], List(),
                    l => (l.findIndex(i => i === key) === -1 ? l.push(key) : l))
            }
        },
        { // works...
            action: 'UPDATE_ACCOUNT_WITNESS_VOTE',
            payloadTypes: {
                witness: string.isRequired,
                approve: bool.isRequired,
            },
            reducer: (state, {payload: {account, witness, approve}}) =>
                state.updateIn(['accounts', account, 'witness_votes'], Set(),
                    votes => (approve ? Set(votes).add(witness) : Set(votes).remove(witness)))
        },
        {
            action: 'DELETE_CONTENT',
            payloadTypes: {
                author: string.isRequired,
                permlink: string.isRequired,
            },
            reducer: (state, {payload: {author, permlink}}) => {
                const key = author + '/' + permlink
                const content = state.getIn(['content', key])
                const parent_author = content.get('parent_author') || ''
                const parent_permlink = content.get('parent_permlink') || ''
                let updatedState = state.deleteIn(['content', key])
                if (parent_author !== '' && parent_permlink !== '') {
                    const parent_key = parent_author + '/' + parent_permlink
                    updatedState = updatedState.updateIn(['content', parent_key, 'replies'],
                        List(), r => r.filter(i => i !== key))
                }
                return updatedState
            }
        },
        {
            action: 'VOTED',
            reducer: (state, {payload: {username, author, permlink, weight}}) => {
                const key = ['content', author + '/' + permlink, 'active_votes']
                let active_votes = state.getIn(key, List())
                const idx = active_votes.findIndex(v => v.get('voter') === username)
                // steemd flips weight into percent
                if(idx === -1)
                    active_votes = active_votes.push(Map({voter: username, percent: weight}))
                else {
                    active_votes = active_votes.set(idx, Map({voter: username, percent: weight}))
                }
                return state.setIn(key, active_votes)
            }
        },
        {
            action: 'FETCHING_DATA',
            reducer: (state, {payload: {order, category}}) => {
                const new_state = state.updateIn(['status', category || '', order], () => {
                    return {fetching: true};
                });
                return new_state;
            }
        },
        {
            action: 'RECEIVE_DATA',
            reducer: (state, {payload: {data, order, category, author, permlink}}) => {
                // console.log('-- RECEIVE_DATA reducer -->', order, category, author, permlink, data);
                // console.log('-- RECEIVE_DATA state -->', state.toJS());
                let new_state;
                if (order === 'by_author') {
                    new_state = state.updateIn(['accounts', author, category], list => {
                        return list.withMutations(posts => {
                            data.forEach(value => {
                                if (!posts.includes(value.permlink)) posts.push(value.permlink);
                            });
                        });
                    });
                } else {
                    new_state = state.updateIn(['discussion_idx', category || '', order], list => {
                        return list.withMutations(posts => {
                            data.forEach(value => {
                                const entry = `${value.author}/${value.permlink}`;
                                if (!posts.includes(entry)) posts.push(entry);
                            });
                        });
                    });
                }
                new_state = new_state.updateIn(['content'], content => {
                    return content.withMutations(map => {
                        data.forEach(value => {
                            const key = `${value.author}/${value.permlink}`;
                            map.set(key, fromJS(value));
                        });
                    });
                });
                new_state = new_state.updateIn(['status', category || '', order], () => {
                    if (data.length < constants.FETCH_DATA_BATCH_SIZE) {
                        return {fetching: false, last_fetch: new Date()};
                    }
                    return {fetching: false};
                });
                // console.log('-- new_state -->', new_state.toJS());
                return new_state;
            }
        },
        {
            action: 'RECEIVE_RECENT_POSTS',
            reducer: (state, {payload: {data}}) => {
                // console.log('-- RECEIVE_RECENT_POSTS state -->', state.toJS());
                // console.log('-- RECEIVE_RECENT_POSTS reducer -->', data);
                let new_state = state.updateIn(['discussion_idx', '', 'created'], list => {
                    if (!list) list = List();
                    return list.withMutations(posts => {
                        data.forEach(value => {
                            const entry = `${value.author}/${value.permlink}`;
                            if (!posts.includes(entry)) posts.unshift(entry);
                        });
                    });
                });
                new_state = new_state.updateIn(['content'], content => {
                    return content.withMutations(map => {
                        data.forEach(value => {
                            const key = `${value.author}/${value.permlink}`;
                            if (!map.has(key)) map.set(key, fromJS(value));
                        });
                    });
                });
                // console.log('-- new_state -->', new_state.toJS());
                return new_state;
            }
        },
        {
            action: 'REQUEST_META', // browser console debug
            payloadTypes: {
                id: string.isRequired,
                link: string.isRequired,
            },
            reducer: (state, {payload: {id, link}}) =>
                state.setIn(['metaLinkData', id], Map({link}))
        },
        {
            action: 'RECEIVE_META', // browser console debug
            payloadTypes: {
                id: string.isRequired,
                meta: object.isRequired,
            },
            reducer: (state, {payload: {id, meta}}) =>
                state.updateIn(['metaLinkData', id], data => data.merge(meta))
        },
        {
            action: 'SET',
            payloadTypes: {
                key: oneOfType([array, string]).isRequired,
                value: any,
            },
            reducer: (state, {payload: {key, value}}) => {
                key = Array.isArray(key) ? key : [key]
                return state.setIn(key, fromJS(value))
            }
        },
        {
            action: 'REMOVE',
            payloadTypes: {
                key: oneOfType([array, string]).isRequired,
            },
            reducer: (state, {payload: {key}}) => {
                key = Array.isArray(key) ? key : [key]
                return state.removeIn(key)
            }
        },
        {
            action: 'UPDATE',
            payloadTypes: {
                key: any.isRequired,
                notSet: any,
                updater: any,
            },
            reducer: (state, {payload: {key, notSet, updater}}) =>
                // key = Array.isArray(key) ? key : [key] // TODO enable and test
                state.updateIn(key, notSet, updater)
        },
        {
            action: 'SET_META_DATA', // browser console debug
            payloadTypes: {
                id: string.isRequired,
                meta: object,
            },
            reducer: (state, {payload: {id, meta}}) =>
                state.setIn(['metaLinkData', id], fromJS(meta))
        },
        {
            action: 'CLEAR_META', // browser console debug
            payloadTypes: {
                id: string.isRequired,
            },
            reducer: (state, {payload: {id}}) =>
                state.deleteIn(['metaLinkData', id])
        },
        {
            action: 'CLEAR_META_ELEMENT', // browser console debug
            payloadTypes: {
                formId: string.isRequired,
                element: oneOf(['description', 'image']).isRequired,
            },
            reducer: (state, {payload: {formId, element}}) =>
                state.updateIn(['metaLinkData', formId], data => data.remove(element))
        },
        {
            action: 'FETCH_JSON',
            payloadTypes: {
                id: string.isRequired,
                url: string.isRequired,
                body: object,
                successCallback: func,
            },
            reducer: state => state // saga
        },
        {
            action: 'FETCH_JSON_RESULT',
            payloadTypes: {
                id: string.isRequired,
                result: any,
                error: object,
            },
            reducer: (state, {payload: {id, result, error}}) =>
                state.set(id, fromJS({result, error}))
        },
        {
            action: 'SHOW_DIALOG',
            payloadTypes: {
                name: string.isRequired,
                params: object,
            },
            reducer: (state, {payload: {name, params = {}}}) =>
                state.update('active_dialogs', Map(), d => d.set(name, fromJS({params})))
        },
        {
            action: 'HIDE_DIALOG',
            payloadTypes: {
                name: string.isRequired,
            },
            reducer: (state, {payload: {name}}) =>
                state.update('active_dialogs', d => d.delete(name))
        },

    ]
});
