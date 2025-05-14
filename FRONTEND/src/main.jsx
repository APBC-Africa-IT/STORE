import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ReactDOM from 'react-dom/client';
import React from 'react';
import './index.css';
import App from './App.jsx';
import {Provider} from 'react-redux';
import store from './store';
import {createBrowserRouter, createRoutesFromElements, Route, RouterProvider} from 'react-router-dom'
import LandingPage from './pages/LandingPage.jsx';

const routes = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<LandingPage />}>
    < Route path="landing" element={<LandingPage />} />
      </Route>

  ))

const root = ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
    <RouterProvider router={routes}/>
    </Provider>
  </React.StrictMode>
)
