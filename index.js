// 用一个全局变量存储被注册的副作用函数
let activeEffect
const effectStack = []

const jobQueue = new Set()
const p = Promise.resolve()
// 一个标志代表是否正在刷新队列
let isFlushing = false

function flushJob() {
  // 如果队列正在刷新，则什么都不做
  if (isFlushing) return
  // 设置为 true，代表正在刷新
  isFlushing = true
  // 在微任务队列中刷新 jobQueue 队列
  p.then(() => {
    console.log('jobQueue', jobQueue)
    jobQueue.forEach(job => job())
  }).finally(() => {
    // 结束后重置 isFlushing
    isFlushing = false
  })
}

const bucket = new WeakMap() 

function effect(fn, options = {}) {
  const effectFn = () => {
    // 当 effectFn 执行时，将其设置为当前激活的副作用函数
    activeEffect = effectFn
    clearEffect(effectFn)
    effectStack.push(effectFn)
    const res = fn()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
    return res
  }
// activeEffect.deps 用来存储所有与该副作用函数相关联的依赖集合
  effectFn.deps = []
  effectFn.options = options
  // 执行副作用函数
  if (!options.lazy) {
    effectFn()
  }
  return effectFn
}
function clearEffect(effectFn) {
  effectFn.deps.forEach(set => {
    set.delete(effectFn)
  })
  effectFn.deps.length = 0
}
function track(target, key) {
  // 没有 activeEffect，直接 return
  if (!activeEffect) return
  let depsMap = bucket.get(target)
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()))
  }
  let deps = depsMap.get(key)
  if (!deps) {
  depsMap.set(key, (deps = new Set()))
  }
  // 把当前激活的副作用函数添加到依赖集合 deps 中
  deps.add(activeEffect)
  // deps 就是一个与当前副作用函数存在联系的依赖集合
  // 将其添加到 activeEffect.deps 数组中
  activeEffect.deps.push(deps) // 新增
}
// 在 set 拦截函数内调用 trigger 函数触发变化
function trigger(target, key) {
  const depsMap = bucket.get(target)
  if (!depsMap) return
  const effects = depsMap.get(key)
  const effectsToRun = new Set()
  effects && effects.forEach(fn => {
    if ( fn!== activeEffect) {
      effectsToRun.add(fn)
    }
  })
  effectsToRun.forEach(fn => {
    if (fn.options.scheduler) {
      fn.options.scheduler(fn)
    } else {
      fn()
    }
  })
}

const data = { foo: 1, bar: 1 }
const obj = new Proxy(data, {
  // 拦截读取操作
  get(target, key) {
    // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
    track(target, key)
    // 返回属性值
    return target[key]
  },
  // 拦截设置操作
  set(target, key, newVal) {
    // 设置属性值
    target[key] = newVal
    // 把副作用函数从桶里取出并执行
    trigger(target, key)
  }
})


function computed(getter) {
  let dirty = true
  // 把 getter 作为副作用函数，创建一个 lazy 的 effect
  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      // 只有trigger里面才会执行
      dirty = true
    }
  })
  const obj = {
    // 当读取 value 时才执行 effectFn
    get value() {
      if(dirty) {
        value = effectFn()
        dirty = false
      }
      return value
    }
  }
  return obj
}

const sumRes = computed(() => obj.foo + obj.bar)
effect(function effectFn1() {
  console.log(sumRes.value)
})
obj.foo++