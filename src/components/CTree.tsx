import React from "react";
import {Button, Input, message, Popover, Select, Tree} from "antd";
import {MinusCircleOutlined, PlusCircleOutlined, PlusSquareOutlined} from '@ant-design/icons'
import KindList from "./KindList";
import {ArrayNode, ND, SourceNode, SourceType, TNode} from "../base/base";
import {
    getNodeByPath,
    getNodeByPathWithTree,
    getTreeNodeByPath,
    nodeSetToTreeNodeSet,
    objToYaml,
    randomString,
    strToLowerCase,
    updateTreeNodeByPath,
    yamlToObjMulti
} from "../base";
import {resources, treeResources} from "../data/base";
import TextArea from "antd/lib/input/TextArea";
import testdata from "../data/prometheusrule";

class CTree extends React.Component<any, any> {

    constructor(props: any) {
        super(props);
        this.state = {
            kindRef: React.createRef(),
            data: [],
            expandedKeys: [],
        }
    }

    deepClone = (obj: any): any => {
        let o: any = {}
        if (typeof obj != "object") return obj
        if (obj === null) return null
        if (obj instanceof Array) {
            o = [];
            for (let i = 0, len = obj.length; i < len; i++) {
                o.push(this.deepClone(obj[i]))
            }
        } else {
            for (let j in obj) {
                if (!obj.hasOwnProperty(j)) continue
                o[j] = this.deepClone(obj[j])
            }
        }
        return o;
    }

    buildFullData = (data: any): any => {
        let result: any = {}
        for (let k in data) {
            if (!data.hasOwnProperty(k)) continue
            const v = data[k]
            if (k === 'children') {
                result.children = []
                result._children = []
                if (data.required && data.required.length > 0) {
                    for (let vv of v) {
                        if (data.required.indexOf(vv.title) === -1) continue
                        result.children.push(this.buildFullData(vv))
                    }
                }
                for (let vv of v) {
                    result._children.push(this.buildFullData(vv))
                }
            } else {
                result[k] = v
            }
        }
        return result
    }

    // TODO 接口获取树结构，需要将指定字段转为Element元素
    convert = (data: any): any => {
        let result: any = this.deepClone(data)
        for (let k in result) {
            if (!result.hasOwnProperty(k)) continue
            const v = this.deepClone(result[k])
            if (k === 'enums' && v !== null && v.length > 0) {
                result._enums = <div>enums</div>
            }
            if (k === 'children' && v !== null && v.length > 0) {
                // TODO 在_children里只需要处理_children数据即可
                // TODO children数据根据_children的required进行渲染
                // TODO children数据不需要存在_children数据，只有根节点同时存在children和_children
                result._children = v
                result.children = []
                if (result.required && result.required.length > 0) {
                    for (let vv of v) {
                        if (result.required.indexOf(vv.title) === -1) continue
                        const child = this.convert(vv)
                        result.children.push(child)
                    }
                }
            }
            return result
        }
    }

    /**
     * 生成Yaml字符串
     */
    convertToYaml = () => {
        if (this.props.buildYamlData) {
            const yamlData = objToYaml(this.parseTreeToObj(this.state.data))
            this.props.buildYamlData(yamlData)
        }
    }

    /**
     * 获取kind对应的渲染数据，并向数据集中增加一组
     * @param group
     * @param kind
     * @param version
     */
    generateResource = (group: string, kind: string, version: string) => {
        const fullData = this.buildFullData(testdata)
        console.log(fullData)
        const data = [...this.state.data, fullData]
        this.setState({data, expandedKeys: this.getExpandedKeys(data)})
    }

    /**
     * 初始结构集转树结构集
     * @param resource
     * @param key
     * @return TNode[]
     */
    buildTreeData = (resource: SourceNode[], key: string = ''): TNode[] => {
        key = key === '' ? '' : key + '.'
        let set: TNode[] = []
        for (const index in resource) {
            const v = resource[index]
            // 跳过非必须节点的渲染
            if (!v.must) continue
            // 初始化结构
            const node: TNode = this.buildTreeNodeData(v, v.name === ArrayNode ? key + index : key + v.name)
            set.push(node)
        }
        return set
    }

    /**
     * 初始结构转树结构
     * @param source
     * @param key
     * @return TNode
     */
    buildTreeNodeData = (source: SourceNode, key: string = ''): TNode => {
        let node: TNode = {
            key,
            name: source.name,
            title: source.name,
            type: source.type,
            value: source.value,
            children: [],
        }
        // 如果数组节点，单独渲染
        if (source.name === ArrayNode) {
            if (source.type === SourceType.Object) {
                node.title = this.createMenuTitle(key, source)
                node.children = this.buildTreeData(source.items, key)
            } else {
                node.title = this.createArrInputNode(key)
            }
            return node
        }

        // 如果类型是object，items为0，则渲染可添加的k/v输入框
        // 如果类型是array，添加数组节点
        switch (source.type) {
            case SourceType.Object:
                // 如果存在子节点
                if (source.items.length > 0) {
                    node.title = this.createMenuTitle(key, source)
                    node.children = this.buildTreeData(source.items, key)
                } else {
                    node.title = this.createAppendObjectNode(key, source)
                }
                break
            case SourceType.Array:
                node.title = this.createAppendArrayNode(key, this.createMenuTitle(key, source))
                node.children = this.buildTreeData(source.items, key)
                break
            case SourceType.Boolean:
                if (source.selects.length === 0) source.selects = [
                    {name: 'true', desc: 'true'},
                    {name: 'false', desc: 'false'}
                ]
                node.title = this.createPrefixNode(
                    this.createMenuTitle(key, source),
                    this.createSelectNode(key, source.selects)
                )
                if (node.value === '') node.value = source.selects[0].name
                break
            default:
                if (source.selects.length > 0) {
                    if (node.value === '') node.value = source.selects[0].name
                    node.title = this.createPrefixNode(
                        this.createMenuTitle(key, source),
                        this.createSelectNode(key, source.selects, node.value)
                    )
                } else {
                    node.title = this.createPrefixNode(
                        this.createMenuTitle(key, source),
                        this.createInputNode(key)
                    )
                }
                break
        }
        return node
    }

    /**
     * 生成树结构数据
     * @param str
     */
    convertToTreeData = (str: string) => {
        let obj: any
        try {
            obj = yamlToObjMulti(str)
        } catch (e) {
            message.error('Yaml格式错误')
            return
        }
        const data = this.parseObjToTreeData(obj)
        this.setState({data, expandedKeys: this.getExpandedKeys(data)})
    }

    /**
     * obj转tree
     * @param obj
     * @return TNode[]
     */
    parseObjToTreeData = (obj: any): TNode[] => {
        let data: TNode[] = []
        for (const key in obj) {
            if (!obj.hasOwnProperty(key)) continue
            const kind: string = key.split('-')[0]
            const resource: SourceNode[] = this.state.kindRef.current.getResource(kind, 'tree')
            let root: TNode = {
                key,
                name: key,
                title: kind,
                type: SourceType.Object,
                value: '',
                children: this.parseObjToTree(obj[key], resource, key)
            }
            data.push(root)
        }
        return data
    }

    /**
     * obj根据resource转tree
     * @param obj
     * @param resource
     * @param prefixKey
     * @param path
     * @param skipNode
     * @return TNode[]
     */
    parseObjToTree = (obj: any, resource: SourceNode[], prefixKey: string, path: string = '', skipNode: boolean = false): TNode[] => {
        /**
         * 根据obj的key拼接成path，根据path获取resource的node信息
         * 根据resource和path渲染tree
         *   ->
         */
        let data: TNode[] = []
        path = path === '' ? '' : path + '.'
        for (const key in obj) {
            if (!obj.hasOwnProperty(key)) continue
            const val = obj[key]
            const keyPath = path + key
            const fullKey = prefixKey + '.' + keyPath
            if (skipNode) {
                let tNode: TNode = {
                    key: fullKey,
                    name: key,
                    title: this.createKVInputNode(fullKey, key, val),
                    type: SourceType.String,
                    value: val,
                    children: []
                }
                data.push(tNode)
                continue
            }
            const node = getNodeByPathWithTree(keyPath, resource)
            if (!node) continue
            let tNode: TNode = {
                key: fullKey,
                name: node.name,
                title: node.name,
                type: node.type,
                value: '',
                children: []
            }
            switch (node.type) {
                case SourceType.Object:
                    // 如果不存在子节点
                    if (node.items.length === 0) {
                        tNode.title = this.createAppendObjectNode(fullKey, node)
                        tNode.children = this.parseObjToTree(val, resource, prefixKey, keyPath, true)
                    } else {
                        tNode.title = this.createMenuTitle(fullKey, node)
                        tNode.children = this.parseObjToTree(val, resource, prefixKey, keyPath)
                    }
                    break
                case SourceType.Array:
                    tNode.title = this.createAppendArrayNode(fullKey, this.createMenuTitle(fullKey, node))
                    tNode.children = this.parseObjToTree(val, resource, prefixKey, keyPath)
                    break
                case SourceType.Boolean:
                    if (node.selects.length === 0) node.selects = [
                        {name: 'true', desc: 'true'},
                        {name: 'false', desc: 'false'}
                    ]
                    tNode.title = this.createPrefixNode(
                        this.createMenuTitle(fullKey, node),
                        this.createSelectNode(fullKey, node.selects)
                    )
                    tNode.value = val === '' ? node.selects[0].name : val
                    break
                default:
                    if (node.selects.length > 0) {
                        if (val !== '') {
                            for (const v of node.selects) {
                                if (v.name === val) {
                                    tNode.value = val
                                    break
                                }
                            }
                        }
                        if (tNode.value === '') tNode.value = node.selects[0].name
                        tNode.title = this.createPrefixNode(
                            this.createMenuTitle(fullKey, node),
                            this.createSelectNode(fullKey, node.selects, tNode.value)
                        )
                    } else {
                        tNode.title = this.createPrefixNode(
                            this.createMenuTitle(fullKey, node),
                            this.createInputNode(fullKey, val)
                        )
                        tNode.value = val
                    }
                    break
            }
            data.push(tNode)
        }
        return data
    }

    /**
     * tree转obj
     * @param nodes
     * @return any
     */
    parseTreeToObj = (nodes: TNode[]): any => {
        let obj: any = {}
        for (const v of nodes) {
            switch (v.type) {
                case SourceType.Object:
                    obj[v.name] = this.parseTreeToObj(v.children)
                    break
                case SourceType.Array:
                    let arr = []
                    for (const va of v.children) {
                        if (va.type === SourceType.Object) {
                            if (va.children.length > 0) arr.push(this.parseTreeToObj(va.children))
                        } else {
                            if (va.value !== '') arr.push(va.value)
                        }
                    }
                    obj[v.name] = arr
                    break
                default:
                    if (v.name !== '') obj[v.name] = v.value
                    break
            }
        }
        return obj
    }

    // 添加text节点
    createTextNode = (path: string, source: SourceNode) => {
        return <TextArea data-path={path} onChange={this.changeInputValue} defaultValue={source.value}/>
    }

    /**
     * 添加select节点
     * @param selectData
     * @param path
     * @param value
     * @return React.ReactNode
     */
    createSelectNode = (path: string, selectData: ND[], value: string = '') => {
        let optionData = []
        for (const v of selectData) {
            optionData.push({
                label: v.name,
                value: JSON.stringify({value: v.name, path})
            })
        }
        const defaultValue = JSON.stringify({
            value: value === '' ? selectData[0].name : value,
            path
        })
        return <Select
            defaultValue={defaultValue}
            className="selectStyle"
            onChange={this.changeSelectValue}
            key={path + randomString(3)}
            options={optionData}
        />
    }

    /**
     * 添加input文本节点
     * @param path
     * @param value
     * @return React.ReactNode
     */
    createInputNode = (path: string, value: string = '') => {
        return <Input data-path={path} onChange={this.changeInputValue} defaultValue={value}/>
    }

    /**
     * 添加K/V input文本节点
     * @param path
     * @param name
     * @param value
     * @return React.ReactNode
     */
    createKVInputNode = (path: string, name: string = '', value: string = '') => {
        return this.createPrefixNode(<Input
            data-path={path}
            style={{width: '150px', height: '80%'}}
            onChange={e => this.changeInputValue(e, false)}
            defaultValue={name}
        />, this.createDeleteNode(path, this.createInputNode(path, value)))
    }

    /**
     * 添加数组input文本节点
     * @param path
     */
    createArrInputNode = (path: string) => this.createPrefixNode(ArrayNode, this.createDeleteNode(path, this.createInputNode(path)))

    /**
     * 创建移除节点按钮
     * @param path
     * @param node
     */
    createDeleteNode = (path: string, node: React.ReactNode) => {
        return (<>
            <span className="floatLeft">{node}</span>
            <span className="floatLeft">
                <Button
                    data-path={path}
                    type='link'
                    icon={<MinusCircleOutlined/>}
                    danger
                    onClick={this.removeObjItem}
                />
            </span>
        </>)
    }

    /**
     * 添加数组按钮节点
     * @param path
     * @param node
     * @return React.ReactNode
     */
    createAppendArrayNode = (path: string, node: React.ReactNode) => {
        return (
            <div className="flex">
                <span className="f1">{node}</span>
                <Button
                    className="f1"
                    data-path={path}
                    type="link"
                    icon={<PlusCircleOutlined/>}
                    style={{marginTop: '-4px'}}
                    onClick={this.addArrItem}
                />
            </div>
        )
    }

    /**
     * 添加对象按钮节点
     * @param path
     * @param source
     * @return React.ReactNode
     */
    createAppendObjectNode = (path: string, source: SourceNode) => {
        return (
            <div className="flex">
                <span className="f1">{this.createMenuTitle(path, source)}</span>
                <Button
                    className="f1"
                    data-path={path}
                    type="link"
                    icon={<PlusSquareOutlined/>}
                    style={{marginTop: '-4px'}}
                    onClick={this.addObjItem}
                />
            </div>
        )
    }

    /**
     * 创建节点前缀
     * @param name
     * @param node
     * @return React.ReactNode
     */
    createPrefixNode = (name: React.ReactNode, node: React.ReactNode) => {
        return (
            <span className="ant-input-wrapper ant-input-group">
                <span className="ant-input-group-addon"> {name} </span>
                <span> {node} </span>
            </span>
        )
    }

    /**
     * 构建标题
     * @param title
     * @param tipContent
     * @param key
     * @return React.ReactNode
     */
    createTitle = (title: React.ReactNode, tipContent: string, key: number = 0) => {
        if (tipContent === '') return title
        return <Popover
            content={tipContent}
            trigger="hover"
            key={key}
        > {title} </Popover>
    }

    // 构建移除菜单
    createDeleteMenu = (path: string, isArray: boolean = false) => {
        return <Button
            key="del"
            data-path={path}
            className="ml2"
            type="primary"
            onClick={isArray ? this.removeObjItem : this.removeItem}
            style={{margin: '5px'}}
            danger
        > delete </Button>
    }

    /**
     * 构建子项菜单
     * @param path
     * @param source
     * @param childs
     * @return React.ReactNode
     */
    createMenuTitle = (path: string, source: any, childs: string[] = []) => {
        // 获取未渲染的子项
        let notExistChildren = []
        for (const item of source.children) if (!item.must && childs.indexOf(item.name) === -1) notExistChildren.push(item)
        // 如果都渲染过， 则直接返回
        if (notExistChildren.length === 0 && source.must) return this.createTitle(source.name, source.desc)
        const set = notExistChildren.map((child, index) => {
            return this.createTitle(<Button
                data-path={path}
                data-name={child.name}
                className="ml2"
                type="primary"
                key={index}
                onClick={this.addItemFromMenu}
                style={{margin: '5px'}}
            > {child.name} </Button>, child.desc, index)
        })
        // 不是必须项，构建基础菜单
        if (!source.must || source.name === ArrayNode) set.unshift(this.createDeleteMenu(path, source.name === ArrayNode))
        return this.createTitle(<Popover
            trigger="click"
            content={<div style={{maxWidth: '500px'}}>{set}</div>}
        > {source.name} </Popover>, source.desc)
    }

    /**
     * 同步菜单项
     * @param path
     * @param addSet  需要添加的子项菜单名
     * @param delSet  需要移除的子项菜单名
     */
    syncItemMenu = (path: string, addSet: string[] = [], delSet: string[] = []) => {
        // 获取选中节点
        const node = getTreeNodeByPath(path, this.state.data)
        if (!node) return
        // 获取选中节点的原数据
        const pathArr = path.split('.')
        const source = getNodeByPathWithTree(pathArr.slice(1).join('.'), treeResources[strToLowerCase(pathArr[0].split('-')[0])])
        if (!source) return
        // 添加或移除子项
        const children = [...node.children]
        for (const s of source.items) {
            if (delSet.indexOf(s.name) > -1) {
                let delStatus = true
                for (const c of children) {
                    if (c.name === s.name) {
                        delStatus = false
                        break
                    }
                }
                if (delStatus) children.push(this.buildTreeNodeData(s, path + '.' + s.name))
            }
            if (addSet.indexOf(s.name) > -1) {
                let addIndex = -1
                for (const ck in children) {
                    if (children[ck].name === s.name) {
                        addIndex = parseInt(ck)
                        break
                    }
                }
                children.splice(addIndex, 1)
            }
        }
        let cs = []
        for (const v of children) cs.push(v.name)
        node.title = this.createMenuTitle(path, source, cs)
        node.children = children
        // 更新选中节点
        const data = updateTreeNodeByPath(path, this.state.data, node)
        this.setState({data})
    }

    addItemFromMenu = (e: any) => {
        const path = e.target.getAttribute('data-path')
        const name = e.target.getAttribute('data-name')
        this.syncItemMenu(path, [], [name])
    }

    /**
     * 添加arr节点子项
     * @param e
     */
    addArrItem = (e: any) => {
        const path = e.target.getAttribute('data-path')
        // 根据path获取到tree的数组节点
        const node = getTreeNodeByPath(path, this.state.data)
        if (!node) return
        console.log(node)
        // 根据path获取resource的对应node信息
        const paths = path.split('.')
        const prefixKey = paths[0].split('-')[0]
        const resource = [...resources[strToLowerCase(prefixKey)]]
        if (!resource) return
        const source = getNodeByPath(paths.slice(1).join('.'), resource)
        if (!source) return
        // 获取数组节点数量
        const nodeChildNum = node.children.length
        // 默认构建普通数组节点
        const keyPath = path + '.' + nodeChildNum
        let tNode: TNode = {
            key: keyPath,
            name: ArrayNode,
            title: this.createArrInputNode(keyPath),
            type: SourceType.String,
            value: '',
            children: [],
        }
        // 如果是数组对象，替换类型和子集
        if (source.items.length > 0) {
            const arraySource = {...source}
            arraySource.name = ArrayNode
            tNode.title = this.createMenuTitle(keyPath, arraySource)
            tNode.type = SourceType.Object
            tNode.children = this.buildTreeData(nodeSetToTreeNodeSet(source.items), keyPath)
        }
        node.children.push(tNode)
        // 根据path更新tree
        const data = updateTreeNodeByPath(path, this.state.data, node)
        this.setState({data})
    }

    /**
     * 添加obj节点子项
     * @param e
     */
    addObjItem = (e: any) => {
        const path = e.target.getAttribute('data-path')
        // 根据path获取tree节点信息
        const node = getTreeNodeByPath(path, this.state.data)
        if (!node) return
        const key = randomString(6)
        const tNode: TNode = {
            key: path + '.' + key,
            name: '',
            title: this.createKVInputNode(path + '.' + key),
            type: SourceType.String,
            value: '',
            children: [],
        }
        node.children.push(tNode)
        const data = updateTreeNodeByPath(path, this.state.data, node)
        this.setState({data})
    }

    /**
     * 移除节点数组/KV子项
     * @param e
     */
    removeObjItem = (e: any) => {
        const path = e.target.getAttribute('data-path')
        const node = getTreeNodeByPath(path, this.state.data)
        if (!node) return
        let data = updateTreeNodeByPath(path, this.state.data, null)
        this.setState({data})
    }

    /**
     * 移除节点子项
     * @param e
     */
    removeItem = (e: any) => {
        const path = e.target.getAttribute('data-path')
        const node = getTreeNodeByPath(path, this.state.data)
        if (!node) return
        let data = updateTreeNodeByPath(path, this.state.data, null)
        this.setState({data})
        // 存在父节点，更新menu
        const pathArr = path.split('.')
        const pathLen = pathArr.length
        if (pathLen === 1) return
        const parentPath = pathArr.slice(0, pathLen - 1).join('.')
        this.syncItemMenu(parentPath, [node.name])
    }

    /**
     * 修改select内容
     * @param val
     */
    changeSelectValue = (val: string) => {
        const valObj = JSON.parse(val)
        const node = getTreeNodeByPath(valObj.path, this.state.data)
        if (!node) return
        node.value = valObj.value
        const data = updateTreeNodeByPath(valObj.path, this.state.data, node)
        this.setState({data})
    }

    /**
     * 修改input内容
     * @param e
     * @param isVal
     */
    changeInputValue = (e: any, isVal: boolean = true) => {
        const path = e.target.getAttribute('data-path')
        const value = e.target.value
        const node = getTreeNodeByPath(path, this.state.data)
        if (!node) return
        isVal ? node.value = value : node.name = value
        const data = updateTreeNodeByPath(path, this.state.data, node)
        this.setState({data})
    }

    /**
     * 选中树节点
     * @param selectedKeys
     * @param e {selected: bool, selectedNodes, node, event}
     */
    onSelect = (selectedKeys: any, e: any) => {
        console.log('onSelect: ', selectedKeys)
    }

    /**
     * 展开节点
     * @param expandedKeys
     * @param e {expanded: bool, node: TNode}
     */
    onExpand = (expandedKeys: any, e: any) => {
        const currentKey = e.node.key
        let currentExpandedKeys = []
        for (const key of expandedKeys) {
            if (key.indexOf(currentKey) !== -1 && key !== currentKey) continue
            currentExpandedKeys.push(key)
        }
        this.setState({expandedKeys: currentExpandedKeys})
    }

    /**
     * 根据树数据获取全部节点key
     * @param nodes
     */
    getExpandedKeys = (nodes: TNode[]) => {
        let expandedKeys: string[] = []
        for (const node of nodes) expandedKeys.push(node.key, ...this.getExpandedKeys(node.children))
        return expandedKeys
    }

    /**
     * 折叠所有节点
     */
    foldAll = () => this.setState({expandedKeys: []})

    /**
     * 展开所有节点
     */
    unfoldAll = () => this.setState({expandedKeys: this.getExpandedKeys(this.state.data)})

    render() {
        return (
            <div className={this.props.className}>
                <KindList
                    ref={this.state.kindRef}
                    generateResource={this.generateResource}
                />
                <Tree
                    className="treeStyle"
                    onSelect={this.onSelect}
                    onExpand={this.onExpand}
                    showLine={true}
                    treeData={this.state.data}
                    expandedKeys={this.state.expandedKeys}
                />
            </div>
        )
    }
}

export default CTree
