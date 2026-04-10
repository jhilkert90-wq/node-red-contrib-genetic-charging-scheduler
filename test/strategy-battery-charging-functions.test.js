const { expect, describe, beforeAll } = require('@jest/globals')
const { mockRandomForEach } = require('jest-mock-random')
const {
  clamp,
  calculateBatteryChargingStrategy,
  crossoverFunction,
  detectPriceInterval,
  findForecastValue
} = require('../src/strategy-battery-charging-functions')

describe('Util functions', () => {
  test('clamp', () => {
    expect(clamp(1, 0, 10)).toBe(1)
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe('Crossover', () => {
  mockRandomForEach(0.4)

  test('should perform a crossover', () => {
    const p = crossoverFunction(
      {
        periods: [
          { start: 0, activity: 1, duration: 10 },
          { start: 30, activity: -1, duration: 10 }
        ],
        excessPvEnergyUse: 0
      },
      {
        periods: [
          { start: 60, activity: 1, duration: 10 },
          { start: 80, activity: -1, duration: 10 }
        ],
        excessPvEnergyUse: 0
      }
    )[0]
    expect(p).toMatchObject({
      periods: [
        { start: 0, activity: 1, duration: 10 },
        { start: 80, activity: -1, duration: 10 }
      ],
      excessPvEnergyUse: 0
    })
  })
})

describe('Calculate', () => {
  beforeAll(() => {
    const now = new Date()
    now.setHours(now.getHours(), 0, 0, 0)
    jest
      .useFakeTimers()
      .setSystemTime(now)
  })
  test('calculate', () => {
    let now = Date.now()
    now = now - (now % (60 * 60 * 1000))
    const priceData = [
      { importPrice: 1, exportPrice: 0, start: new Date(now).toString() },
      {
        importPrice: 500,
        exportPrice: 0,
        start: new Date(now + 60 * 60 * 1000).toString()
      },
      {
        importPrice: 500,
        exportPrice: 0,
        start: new Date(now + 60 * 60 * 1000 * 2).toString()
      }
    ]
    const productionForecast = priceData.map((v) => {
      return { start: v.start, value: 0 }
    })
    const consumptionForecast = priceData.map((v) => {
      return { start: v.start, value: 1.5 }
    })
    const populationSize = 100
    const numberOfPricePeriods = priceData.length
    const generations = 500
    const mutationRate = 0.03

    const batteryMaxEnergy = 3 // kWh
    const batteryMaxOutputPower = 3 // kW
    const batteryMaxInputPower = 3 // kW
    const averageConsumption = 1.5 // kW
    const averageProduction = 0 // kW
    const soc = 0
    const excessPvEnergyUse = 0
    const efficiency = 1
    const batteryCost = 0

    const config = {
      priceData,
      populationSize,
      numberOfPricePeriods,
      generations,
      mutationRate,
      batteryMaxEnergy,
      batteryMaxOutputPower,
      batteryMaxInputPower,
      averageConsumption,
      averageProduction,
      productionForecast,
      consumptionForecast,
      soc,
      excessPvEnergyUse,
      efficiency,
      batteryCost
    }
    const strategy = calculateBatteryChargingStrategy(config)
    const bestSchedule = strategy.best.schedule
    console.log(bestSchedule)

    expect(bestSchedule.length).toEqual(3)
    expect(bestSchedule[0]).toMatchObject({
      activity: 1,
      duration: 60
    })
    expect(bestSchedule[1]).toMatchObject({
      activity: -1,
      name: 'discharging',
      duration: 60
    })
    expect(bestSchedule[2]).toMatchObject({
      activity: -1,
      name: 'discharging',
      duration: 60
    })

    expect(strategy.best.excessPvEnergyUse).toEqual(excessPvEnergyUse)
    expect(strategy.best.cost).not.toBeNull()
    expect(strategy.best.cost).not.toBeNaN()

    console.log(`best: ${strategy.best.cost}`)
    console.log(`no battery: ${strategy.noBattery.cost}`)

    const values = bestSchedule
      .filter((e) => e.activity !== 0)
      .reduce((total, e) => {
        const toTimeString = (date) => {
          const HH = date.getHours().toString().padStart(2, '0')
          const mm = date.getMinutes().toString().padStart(2, '0')
          return `${HH}:${mm}`
        }

        const touPattern = (start, end, charge) => {
          let pattern = toTimeString(start)
          pattern += '-'
          pattern += toTimeString(end)
          pattern += '/'
          pattern += start.getDay()
          pattern += '/'
          pattern += charge
          return pattern
        }

        const startDate = new Date(e.start)
        const endDate = new Date(startDate.getTime() + (e.duration - 1) * 60000)
        const charge = e.activity === 1 ? '+' : '-'
        if (startDate.getDay() === endDate.getDay()) {
          total.push(touPattern(startDate, endDate, charge))
        } else {
          const endDateDay1 = new Date(startDate)
          endDateDay1.setHours(23)
          endDateDay1.setMinutes(59)
          total.push(touPattern(startDate, endDateDay1, charge))

          const startDateDay2 = new Date(endDate)
          startDateDay2.setHours(0)
          startDateDay2.setMinutes(0)
          total.push(touPattern(startDateDay2, endDate, charge))
        }
        return total
      }, [])
  })
})

describe('detectPriceInterval', () => {
  test('should return 60 for single price entry', () => {
    expect(detectPriceInterval([{ start: new Date().toString() }])).toBe(60)
  })

  test('should return 60 for hourly prices', () => {
    const now = Date.now()
    const priceData = [
      { start: new Date(now).toString() },
      { start: new Date(now + 60 * 60 * 1000).toString() }
    ]
    expect(detectPriceInterval(priceData)).toBe(60)
  })

  test('should return 15 for 15-minute prices', () => {
    const now = Date.now()
    const priceData = [
      { start: new Date(now).toString() },
      { start: new Date(now + 15 * 60 * 1000).toString() }
    ]
    expect(detectPriceInterval(priceData)).toBe(15)
  })
})

describe('findForecastValue', () => {
  test('should find exact match', () => {
    const now = Date.now()
    const forecast = [{ start: new Date(now).toString(), value: 1.5 }]
    expect(findForecastValue(forecast, new Date(now).toString(), 60)).toBe(1.5)
  })

  test('should interpolate hourly forecast for 15-min period', () => {
    let now = Date.now()
    now = now - (now % (60 * 60 * 1000))
    const forecast = [{ start: new Date(now).toString(), value: 2.0 }]
    // Query for 15 minutes into the hour - should find the hourly value
    const quarterTime = new Date(now + 15 * 60 * 1000).toString()
    expect(findForecastValue(forecast, quarterTime, 15)).toBe(2.0)
  })

  test('should return undefined when no match found', () => {
    const now = Date.now()
    const forecast = [{ start: new Date(now).toString(), value: 1.5 }]
    const futureTime = new Date(now + 2 * 60 * 60 * 1000).toString()
    expect(findForecastValue(forecast, futureTime, 60)).toBeUndefined()
  })
})

describe('Calculate with 15-minute prices', () => {
  beforeAll(() => {
    const now = new Date()
    now.setHours(now.getHours(), 0, 0, 0)
    jest
      .useFakeTimers()
      .setSystemTime(now)
  })

  test('should generate 15-minute schedule from 15-minute prices', () => {
    let now = Date.now()
    now = now - (now % (60 * 60 * 1000))
    // 4 x 15min prices for 1 hour
    const priceData = [
      { importPrice: 1, exportPrice: 0, start: new Date(now).toString() },
      { importPrice: 1, exportPrice: 0, start: new Date(now + 15 * 60 * 1000).toString() },
      { importPrice: 500, exportPrice: 0, start: new Date(now + 30 * 60 * 1000).toString() },
      { importPrice: 500, exportPrice: 0, start: new Date(now + 45 * 60 * 1000).toString() },
      { importPrice: 500, exportPrice: 0, start: new Date(now + 60 * 60 * 1000).toString() },
      { importPrice: 500, exportPrice: 0, start: new Date(now + 75 * 60 * 1000).toString() },
      { importPrice: 500, exportPrice: 0, start: new Date(now + 90 * 60 * 1000).toString() },
      { importPrice: 500, exportPrice: 0, start: new Date(now + 105 * 60 * 1000).toString() }
    ]
    // Hourly consumption forecast (should be interpolated to 15min)
    const consumptionForecast = [
      { start: new Date(now).toString(), value: 1.5 },
      { start: new Date(now + 60 * 60 * 1000).toString(), value: 1.5 }
    ]
    const productionForecast = priceData.map((v) => {
      return { start: v.start, value: 0 }
    })

    const config = {
      priceData,
      populationSize: 50,
      generations: 200,
      mutationRate: 0.03,
      batteryMaxEnergy: 3,
      batteryMaxOutputPower: 3,
      batteryMaxInputPower: 3,
      averageConsumption: 1.5,
      averageProduction: 0,
      productionForecast,
      consumptionForecast,
      soc: 0,
      excessPvEnergyUse: 0,
      efficiency: 1,
      batteryCost: 0
    }
    const strategy = calculateBatteryChargingStrategy(config)
    const bestSchedule = strategy.best.schedule

    // Should have 8 periods (one per 15-min slot)
    expect(bestSchedule.length).toEqual(8)
    // Each period should be 15 minutes
    expect(bestSchedule[1].duration).toEqual(15)
    // First two periods should charge (cheap price)
    expect(bestSchedule[0].activity).toEqual(1)
    expect(bestSchedule[1].activity).toEqual(1)
  })

  test('should interpolate hourly consumption to 15-min periods', () => {
    let now = Date.now()
    now = now - (now % (60 * 60 * 1000))
    const priceData = [
      { importPrice: 1, exportPrice: 0, start: new Date(now).toString() },
      { importPrice: 1, exportPrice: 0, start: new Date(now + 15 * 60 * 1000).toString() },
      { importPrice: 1, exportPrice: 0, start: new Date(now + 30 * 60 * 1000).toString() },
      { importPrice: 1, exportPrice: 0, start: new Date(now + 45 * 60 * 1000).toString() }
    ]
    // Only hourly consumption forecast
    const consumptionForecast = [
      { start: new Date(now).toString(), value: 2.0 }
    ]
    const productionForecast = []

    const config = {
      priceData,
      populationSize: 10,
      generations: 10,
      mutationRate: 0.03,
      batteryMaxEnergy: 5,
      batteryMaxOutputPower: 3,
      batteryMaxInputPower: 3,
      averageConsumption: 1.0,
      averageProduction: 0,
      productionForecast,
      consumptionForecast,
      soc: 0.5,
      excessPvEnergyUse: 0,
      efficiency: 1,
      batteryCost: 0
    }
    const strategy = calculateBatteryChargingStrategy(config)
    expect(strategy.best.schedule.length).toEqual(4)
    // All periods should be 15 min
    expect(strategy.best.schedule[1].duration).toEqual(15)
  })
})

describe('Calculate with min/max SoC', () => {
  beforeAll(() => {
    const now = new Date()
    now.setHours(now.getHours(), 0, 0, 0)
    jest
      .useFakeTimers()
      .setSystemTime(now)
  })

  test('should respect maxSoc - battery should not charge above maxSoc', () => {
    let now = Date.now()
    now = now - (now % (60 * 60 * 1000))
    const priceData = [
      { importPrice: 1, exportPrice: 0, start: new Date(now).toString() },
      { importPrice: 1, exportPrice: 0, start: new Date(now + 60 * 60 * 1000).toString() }
    ]
    const consumptionForecast = priceData.map((v) => {
      return { start: v.start, value: 0 }
    })
    const productionForecast = priceData.map((v) => {
      return { start: v.start, value: 0 }
    })

    const config = {
      priceData,
      populationSize: 50,
      generations: 200,
      mutationRate: 0.03,
      batteryMaxEnergy: 10, // 10kWh nominal
      batteryMaxOutputPower: 5,
      batteryMaxInputPower: 5,
      averageConsumption: 0,
      averageProduction: 0,
      productionForecast,
      consumptionForecast,
      soc: 0.5, // 50% = 5kWh
      excessPvEnergyUse: 0,
      efficiency: 1,
      batteryCost: 0,
      maxSoc: 0.8 // max 80% = 8kWh
    }
    const strategy = calculateBatteryChargingStrategy(config)

    // SoC should never exceed 80%
    for (const period of strategy.best.schedule) {
      expect(period.socEnd).toBeLessThanOrEqual(80.01) // small tolerance for floating point
    }
  })

  test('should respect minSoc - battery should not discharge below minSoc', () => {
    let now = Date.now()
    now = now - (now % (60 * 60 * 1000))
    const priceData = [
      { importPrice: 500, exportPrice: 0, start: new Date(now).toString() },
      { importPrice: 500, exportPrice: 0, start: new Date(now + 60 * 60 * 1000).toString() }
    ]
    const consumptionForecast = priceData.map((v) => {
      return { start: v.start, value: 2 }
    })
    const productionForecast = priceData.map((v) => {
      return { start: v.start, value: 0 }
    })

    const config = {
      priceData,
      populationSize: 50,
      generations: 200,
      mutationRate: 0.03,
      batteryMaxEnergy: 10, // 10kWh nominal
      batteryMaxOutputPower: 5,
      batteryMaxInputPower: 5,
      averageConsumption: 2,
      averageProduction: 0,
      productionForecast,
      consumptionForecast,
      soc: 0.5, // 50% = 5kWh
      excessPvEnergyUse: 0,
      efficiency: 1,
      batteryCost: 0,
      minSoc: 0.2 // min 20% = 2kWh
    }
    const strategy = calculateBatteryChargingStrategy(config)

    // SoC should never go below 20%
    for (const period of strategy.best.schedule) {
      expect(period.socEnd).toBeGreaterThanOrEqual(19.99) // small tolerance for floating point
    }
  })
})
