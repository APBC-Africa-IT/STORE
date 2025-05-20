import React, { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

function VehicleSelector() {
  const [vehicleData, setVehicleData] = useState({
    make: '',
    model: '',
    year: '',
    engine: ''
  });

  const makeOptions = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'BMW', 'Mercedes', 'Audi', 'Volkswagen'];
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setVehicleData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Logic to search for parts specific to the vehicle
    console.log('Searching for parts for:', vehicleData);
  };

  return (
    <section className="py-8 bg-primary-900 text-white">
      <div className="container-custom">
        <div className="md:flex items-center justify-between mb-6">
          <div className="mb-4 md:mb-0">
            <h2 className="text-xl md:text-2xl font-bold">Find Parts For Your Vehicle</h2>
            <p className="text-primary-100 mt-1">Select your vehicle to find exactly what fits</p>
          </div>
          <Link 
            to="/part-finder"
            className="inline-flex items-center text-primary-200 hover:text-white transition-colors font-medium"
          >
            Advanced Search
            <ArrowRight size={16} className="ml-1" />
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="make" className="block text-sm font-medium text-neutral-700 mb-1">
                Make
              </label>
              <select
                id="make"
                name="make"
                value={vehicleData.make}
                onChange={handleChange}
                className="block w-full rounded-md border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                required
              >
                <option value="">Select Make</option>
                {makeOptions.map(make => (
                  <option key={make} value={make}>{make}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="model" className="block text-sm font-medium text-neutral-700 mb-1">
                Model
              </label>
              <select
                id="model"
                name="model"
                value={vehicleData.model}
                onChange={handleChange}
                className="block w-full rounded-md border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                disabled={!vehicleData.make}
              >
                <option value="">Select Model</option>
                {/* Model options would be populated based on selected make */}
                <option value="model1">Model 1</option>
                <option value="model2">Model 2</option>
              </select>
            </div>

            <div>
              <label htmlFor="year" className="block text-sm font-medium text-neutral-700 mb-1">
                Year
              </label>
              <select
                id="year"
                name="year"
                value={vehicleData.year}
                onChange={handleChange}
                className="block w-full rounded-md border-neutral-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                disabled={!vehicleData.model}
              >
                <option value="">Select Year</option>
                {/* Generate years from current year down to 1990 */}
                {Array.from({ length: 35 }, (_, i) => new Date().getFullYear() - i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 font-medium flex items-center justify-center transition-colors"
                disabled={!vehicleData.make || !vehicleData.model || !vehicleData.year}
              >
                <Search size={18} className="mr-2" />
                Find Parts
              </button>
            </div>
          </div>

          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm text-primary-600 hover:text-primary-800 font-medium transition-colors"
            >
              Browse by Vehicle Make & Model
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export default VehicleSelector;