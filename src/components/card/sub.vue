<template>
    <div class="card-list">
        <div id="我的收藏" class="card-section" v-show="visibleFavoriteList.length">
            <Card class="nodeCard">
                <p slot="title" class="anchor">我的收藏<a href="#我的收藏">#</a></p>
                <span slot="extra" class="card-extra-btn" @click="removeFavorite">
                    <Icon type="ios-loop-strong"></Icon>
                    清空
                </span>
                <Nav :navData="visibleFavoriteList" :del=true :spinShow="spinShow"></Nav>
            </Card>
        </div>
        <div id="常用网址" class="card-section" v-show="visibleUsedList.length">
            <Card class="nodeCard">
                <p slot="title" class="anchor">常用网址<a href="#常用网址">#</a></p>
                <span slot="extra" class="card-extra-btn" @click="removeUsed">
                    <Icon type="ios-loop-strong"></Icon>
                    清空
                </span>
                <Nav :navData="visibleUsedList" :del=true :spinShow="spinShow"></Nav>
            </Card>
        </div>
        <div :id="item.title" class="card-section" v-for="(item,index) in data" :key="index">
            <Card class="nodeCard">
                <p slot="title" class="anchor">{{ item.title }}<a :href="'#' + item.title">#</a></p>
                <p slot="extra">共计：{{ item.nav.length}} 个网址</p>
                <Nav :navData="item.nav" :subTitle="item.title" :spinShow="spinShow"></Nav>
            </Card>
        </div>
    </div>
</template>

<script>
import Nav from '@/components/card/nav'
import {mapGetters, mapActions} from 'vuex'
export default {
    props: {
        data: {
            default: {}
        },
        catalog: {
            default: null
        },
        filterHistory: {
            type: Boolean,
            default: false
        },
        spinShow: {
            default: false
        }
    },
    methods: {
        filterCurrentHistory (list) {
            if (!this.currentLinkMap) return list
            var map = this.currentLinkMap
            return list.map(function (item) {
                if (!item || !item.resourceKey || !map[item.resourceKey]) return null
                var current = map[item.resourceKey]
                return {
                    name: current.name,
                    link: current.link,
                    desc: current.desc,
                    icon: current.icon,
                    sortOrder: current.sortOrder,
                    alias: current.alias,
                    resourceKey: current.resourceKey,
                    num: item.num
                }
            }).filter(function (item) { return item !== null })
        },
        removeUsed () {
            this.removeUsedList()
            this.$Message.success('清空成功')
        },
        removeFavorite () {
            this.removeFavoriteList()
            this.$Message.success('清空成功')
        },
        ...mapActions([
            'removeUsedList',
            'removeFavoriteList'
        ])
    },
    computed: {
        ...mapGetters([
            'favoriteList',
            'usedList'
        ]),
        currentLinkMap () {
            if (!this.filterHistory) return null
            var groups = Array.isArray(this.catalog) ? this.catalog : (Array.isArray(this.data) ? this.data : [])
            var map = {}
            groups.forEach(function (group) {
                (group.nav || []).forEach(function (item) {
                    if (item.resourceKey) map[item.resourceKey] = item
                })
            })
            return map
        },
        visibleFavoriteList () {
            return this.filterCurrentHistory(this.favoriteList)
        },
        visibleUsedList () {
            return this.filterCurrentHistory(this.usedList)
        }
    },
    components: {
        Nav
    }
}
</script>

<style lang=less scoped>
.card-list {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.card-section {
    .nodeCard {
        margin: 0;
    }
}

.anchor a {
    opacity: 0;
    font-size: 24px;
    transition: opacity .2s ease-in-out;
    margin-left: 5px;
    position: relative;
    top: 2px;
}
.nodeCard {
    border-radius: 16px !important;
    border: none !important;
    box-shadow: none !important;
    background: var(--card-bg) !important;

    /deep/ .ivu-card-body {
        padding: 24px !important;
    }

    /deep/ .ivu-card-head {
        border-bottom: none !important;
        padding: 24px 24px 0 24px !important;
        line-height: normal !important;

        p {
            font-size: 16px !important;
            font-weight: 600 !important;
            color: var(--foreground-primary) !important;
        }

        .ivu-card-extra {
            top: 50% !important;
            transform: translateY(-50%) !important;
        }
    }
}

.card-extra-btn {
    color: var(--foreground-muted);
    font-size: 12px;
    cursor: pointer;

    &:hover {
        color: var(--accent-primary);
    }
}
</style>
